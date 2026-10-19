/**
 * Logica de ventanas horarias para la programacion de pedidos.
 *
 * Son funciones puras: no tocan la base de datos ni Express. El horario
 * operativo tampoco lo leen ellas: se lo pasa quien las llama, que es el
 * unico que habla con la coleccion parametros (ver configuracionOperativa.ts).
 *
 * Esa separacion es a proposito. El horario dejo de ser una constante del
 * codigo y ahora es configurable, pero si estas funciones lo fueran a buscar
 * a la base dejarian de ser puras: habria que levantar Mongo para probar una
 * cuenta de fechas, y cada llamada haria una consulta de mas.
 *
 * Las horas se interpretan en la zona horaria del servidor: "07:00" es
 * las 7 de la manana en la hora local de la maquina que corre el backend.
 */

export interface VentanaHoraria {
  inicio: Date;
  fin: Date;
}

/**
 * Horario de atencion del deposito.
 *
 * diasHabiles usa la numeracion de Date.getDay(): 0 es domingo y 6 sabado.
 * Es una lista y no un rango "desde-hasta" para poder representar un
 * descanso en el medio de la semana sin cambiar el tipo.
 */
export interface HorarioOperativo {
  horaApertura: number;
  horaCierre: number;
  diasHabiles: number[];
}

const MS_POR_MINUTO = 60 * 1000;

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/**
 * Texto del horario para los mensajes de error, por ejemplo "07:00 a 17:00".
 * Se arma con la configuracion vigente y no con un texto fijo, asi el
 * mensaje nunca contradice al horario que esta aplicando el backend.
 */
export const textoHorario = (horario: HorarioOperativo): string =>
  `${dosDigitos(horario.horaApertura)}:00 a ${dosDigitos(horario.horaCierre)}:00`;

const NOMBRES_DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado'
];

/** Texto de los dias habiles para los mensajes de error. */
export const textoDiasHabiles = (horario: HorarioOperativo): string => {
  const nombres = horario.diasHabiles.map((dia) => NOMBRES_DIAS[dia]);

  if (nombres.length <= 1) {
    return nombres.join('');
  }

  // "lunes, martes y miercoles"
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
};

/**
 * Calcula la ventana de un pedido: empieza en la fecha programada
 * y termina cuando se cumple la duracion estimada.
 */
export const calcularVentana = (inicio: Date, duracionMinutos: number): VentanaHoraria => ({
  inicio: new Date(inicio.getTime()),
  fin: new Date(inicio.getTime() + duracionMinutos * MS_POR_MINUTO)
});

/** Indica si el dia de `fecha` es un dia de atencion del deposito. */
export const esDiaHabil = (fecha: Date, horario: HorarioOperativo): boolean =>
  horario.diasHabiles.includes(fecha.getDay());

/**
 * Devuelve la apertura y el cierre del horario operativo del dia de `fecha`.
 * Se trabaja sobre copias: setHours modifica el Date original.
 */
export const limitesDelDia = (fecha: Date, horario: HorarioOperativo): VentanaHoraria => {
  const apertura = new Date(fecha.getTime());
  apertura.setHours(horario.horaApertura, 0, 0, 0);

  const cierre = new Date(fecha.getTime());
  cierre.setHours(horario.horaCierre, 0, 0, 0);

  return { inicio: apertura, fin: cierre };
};

/**
 * Indica si una ventana entra completa dentro del horario operativo de su dia,
 * y si ese dia es habil.
 */
export const estaDentroDelHorario = (
  ventana: VentanaHoraria,
  horario: HorarioOperativo
): boolean => {
  if (!esDiaHabil(ventana.inicio, horario)) {
    return false;
  }

  const { inicio: apertura, fin: cierre } = limitesDelDia(ventana.inicio, horario);
  return ventana.inicio >= apertura && ventana.fin <= cierre;
};

/**
 * Dos ventanas se solapan si cada una empieza antes de que termine la otra.
 *
 * La comparacion es estricta a proposito: un pedido de 09:00 a 10:00 y otro
 * de 10:00 a 11:00 NO se solapan, porque uno termina justo cuando empieza
 * el otro. Con <= esos dos turnos consecutivos se rechazarian sin motivo.
 */
export const seSolapan = (a: VentanaHoraria, b: VentanaHoraria): boolean =>
  a.inicio < b.fin && b.inicio < a.fin;

/**
 * Busca el primer hueco libre de `duracionMinutos` a partir de `desde`,
 * dentro del horario operativo de ESE mismo dia.
 *
 * Arranca en `desde` (o en la apertura, si `desde` es mas temprano) y, cada
 * vez que el candidato choca con una ventana ocupada, salta al final de esa
 * ventana y vuelve a probar. Como el candidato solo avanza, el ciclo termina.
 *
 * Devuelve null si el dia no es habil o si ya no queda lugar ese dia.
 */
export const buscarSiguienteHueco = (
  desde: Date,
  duracionMinutos: number,
  ocupadas: VentanaHoraria[],
  horario: HorarioOperativo
): VentanaHoraria | null => {
  if (!esDiaHabil(desde, horario)) {
    return null;
  }

  const { inicio: apertura, fin: cierre } = limitesDelDia(desde, horario);

  let candidato = calcularVentana(desde < apertura ? apertura : desde, duracionMinutos);

  while (candidato.fin <= cierre) {
    const choque = ocupadas.find((ocupada) => seSolapan(candidato, ocupada));

    if (!choque) {
      return candidato;
    }

    candidato = calcularVentana(choque.fin, duracionMinutos);
  }

  return null;
};

/**
 * Junta `cantidad` ventanas libres a partir de `desde`, para ofrecerlas
 * como alternativa cuando el horario pedido esta ocupado.
 *
 * Primero recorre lo que queda del mismo dia; si no alcanza, sigue con
 * los dias siguientes desde la apertura, hasta `diasMaximos` dias despues.
 * Los dias no habiles se saltean. Cada alternativa arranca donde termina la
 * anterior, asi no se pisan entre si.
 */
export const buscarAlternativas = (
  desde: Date,
  duracionMinutos: number,
  ocupadas: VentanaHoraria[],
  horario: HorarioOperativo,
  cantidad = 3,
  diasMaximos = 7
): VentanaHoraria[] => {
  const alternativas: VentanaHoraria[] = [];

  for (let dia = 0; dia <= diasMaximos && alternativas.length < cantidad; dia++) {
    let cursor: Date;

    if (dia === 0) {
      cursor = desde;
    } else {
      cursor = new Date(desde.getTime());
      cursor.setDate(cursor.getDate() + dia);
      cursor.setHours(horario.horaApertura, 0, 0, 0);
    }

    // Un domingo (o cualquier dia no habil) no ofrece ninguna franja:
    // se pasa al siguiente sin intentar buscar huecos.
    if (!esDiaHabil(cursor, horario)) {
      continue;
    }

    while (alternativas.length < cantidad) {
      const hueco = buscarSiguienteHueco(cursor, duracionMinutos, ocupadas, horario);

      if (!hueco) {
        break;
      }

      alternativas.push(hueco);
      cursor = hueco.fin;
    }
  }

  return alternativas;
};
