import Parametro from '../models/Parametro';
import { HorarioOperativo } from './ventanaHoraria';
import { Tolerancias } from './puntualidad';

/**
 * Lee de la coleccion parametros la configuracion de operacion: el horario
 * del deposito y los margenes de tolerancia de las llegadas.
 *
 * Antes eran constantes en el codigo. Al vivir en la base, el negocio puede
 * ajustar un margen sin volver a desplegar el backend, y queda auditado
 * quien lo cambio y cuando.
 */

/**
 * Claves con las que se guardan los parametros. El codigo nunca escribe la
 * cadena suelta: si alguien renombra una clave, se cambia aca y se ve al
 * compilar donde impacta.
 */
export const CLAVES_PARAMETROS = {
  horaApertura: 'HORA_APERTURA',
  horaCierre: 'HORA_CIERRE',
  diasHabiles: 'DIAS_HABILES',
  toleranciaAnticipadoMinutos: 'TOLERANCIA_ANTICIPADO_MINUTOS',
  toleranciaTardioMinutos: 'TOLERANCIA_TARDIO_MINUTOS',
  toleranciaAusenteMinutos: 'TOLERANCIA_AUSENTE_MINUTOS'
} as const;

export interface ConfiguracionOperativa {
  horario: HorarioOperativo;
  tolerancias: Tolerancias;
}

/**
 * Valores por defecto: los mismos que estaban fijos en el codigo.
 *
 * Se usan cuando falta el parametro en la base. La alternativa era cortar la
 * operacion con un 500, pero eso deja el sistema entero inutilizable porque
 * alguien dio de baja una fila de configuracion. Se avisa por consola una
 * sola vez por clave, para que el aviso no se pierda entre miles de lineas.
 */
export const CONFIGURACION_POR_DEFECTO: ConfiguracionOperativa = {
  horario: {
    horaApertura: 7,
    horaCierre: 17,
    // 0 = domingo ... 6 = sabado. El deposito opera de lunes a sabado.
    diasHabiles: [1, 2, 3, 4, 5, 6]
  },
  tolerancias: {
    anticipadoMinutos: 15,
    tardioMinutos: 15,
    ausenteMinutos: 60
  }
};

/** Segundos que se reutiliza la configuracion ya leida (ver el cache abajo). */
const SEGUNDOS_DE_CACHE = 60;

let cache: { valor: ConfiguracionOperativa; vence: number } | null = null;
const clavesYaAvisadas = new Set<string>();

const avisarFalta = (clave: string, porDefecto: unknown): void => {
  if (clavesYaAvisadas.has(clave)) {
    return;
  }

  clavesYaAvisadas.add(clave);
  console.warn(
    `[Parametros] Falta o es invalido el parametro ${clave}: se usa el valor por defecto (${String(
      porDefecto
    )}). Corre "npm run seed:parametros".`
  );
};

/**
 * Convierte el valor de texto del parametro a un entero valido.
 * Si falta, no es numero o esta fuera de rango, devuelve el valor por defecto.
 */
const aEntero = (
  clave: string,
  texto: string | undefined,
  porDefecto: number,
  minimo: number,
  maximo: number
): number => {
  const numero = Number(texto);

  if (texto === undefined || !Number.isInteger(numero) || numero < minimo || numero > maximo) {
    avisarFalta(clave, porDefecto);
    return porDefecto;
  }

  return numero;
};

/**
 * Los dias habiles se guardan como una lista separada por comas ("1,2,3,4,5,6")
 * porque el valor del parametro es un texto. Se descartan los repetidos y lo
 * que no sea un dia de la semana.
 */
const aDiasHabiles = (texto: string | undefined, porDefecto: number[]): number[] => {
  if (texto === undefined) {
    avisarFalta(CLAVES_PARAMETROS.diasHabiles, porDefecto.join(','));
    return porDefecto;
  }

  const dias = [
    ...new Set(
      texto
        .split(',')
        .map((parte) => Number(parte.trim()))
        .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)
    )
  ].sort();

  if (dias.length === 0) {
    avisarFalta(CLAVES_PARAMETROS.diasHabiles, porDefecto.join(','));
    return porDefecto;
  }

  return dias;
};

/**
 * Borra el cache. La llaman los endpoints que escriben parametros, para que
 * un cambio se vea en la operacion sin esperar a que venza el cache.
 */
export const invalidarConfiguracionOperativa = (): void => {
  cache = null;
};

/**
 * Devuelve la configuracion de operacion, leyendo la coleccion parametros.
 *
 * Se cachea por unos segundos porque cada alta de pedido la necesita y la
 * configuracion cambia muy de vez en cuando. El cache tiene las dos salidas:
 * se invalida al escribir un parametro (mismo proceso) y ademas vence solo,
 * que es lo que cubre el caso de otra instancia del backend escribiendo.
 */
export const obtenerConfiguracionOperativa = async (): Promise<ConfiguracionOperativa> => {
  if (cache && cache.vence > Date.now()) {
    return cache.valor;
  }

  const claves = Object.values(CLAVES_PARAMETROS);

  // Una sola consulta para los seis parametros, en lugar de una por clave.
  const filas = await Parametro.find({ clave: { $in: claves }, activo: true })
    .select('clave valor')
    .lean();

  const valores = new Map(filas.map((fila) => [fila.clave, fila.valor]));
  const { horario, tolerancias } = CONFIGURACION_POR_DEFECTO;

  const horaApertura = aEntero(
    CLAVES_PARAMETROS.horaApertura,
    valores.get(CLAVES_PARAMETROS.horaApertura),
    horario.horaApertura,
    0,
    23
  );

  let horaCierre = aEntero(
    CLAVES_PARAMETROS.horaCierre,
    valores.get(CLAVES_PARAMETROS.horaCierre),
    horario.horaCierre,
    1,
    24
  );

  // Un cierre anterior o igual a la apertura dejaria el deposito sin ninguna
  // franja valida y todo pedido seria rechazado sin explicacion clara.
  if (horaCierre <= horaApertura) {
    avisarFalta(CLAVES_PARAMETROS.horaCierre, horario.horaCierre);
    horaCierre = horario.horaCierre;
  }

  const anticipadoMinutos = aEntero(
    CLAVES_PARAMETROS.toleranciaAnticipadoMinutos,
    valores.get(CLAVES_PARAMETROS.toleranciaAnticipadoMinutos),
    tolerancias.anticipadoMinutos,
    0,
    24 * 60
  );

  const tardioMinutos = aEntero(
    CLAVES_PARAMETROS.toleranciaTardioMinutos,
    valores.get(CLAVES_PARAMETROS.toleranciaTardioMinutos),
    tolerancias.tardioMinutos,
    0,
    24 * 60
  );

  let ausenteMinutos = aEntero(
    CLAVES_PARAMETROS.toleranciaAusenteMinutos,
    valores.get(CLAVES_PARAMETROS.toleranciaAusenteMinutos),
    tolerancias.ausenteMinutos,
    0,
    24 * 60
  );

  // El limite de ausencia tiene que ser posterior al margen tardio: si no,
  // no existiria ninguna llegada TARDIA (pasaria directo de A TIEMPO a
  // AUSENTE) y un parametro mal cargado borraria un estado entero.
  if (ausenteMinutos <= tardioMinutos) {
    avisarFalta(CLAVES_PARAMETROS.toleranciaAusenteMinutos, tolerancias.ausenteMinutos);
    ausenteMinutos = Math.max(tardioMinutos + 1, tolerancias.ausenteMinutos);
  }

  const valor: ConfiguracionOperativa = {
    horario: {
      horaApertura,
      horaCierre,
      diasHabiles: aDiasHabiles(
        valores.get(CLAVES_PARAMETROS.diasHabiles),
        horario.diasHabiles
      )
    },
    tolerancias: { anticipadoMinutos, tardioMinutos, ausenteMinutos }
  };

  cache = { valor, vence: Date.now() + SEGUNDOS_DE_CACHE * 1000 };

  return valor;
};
