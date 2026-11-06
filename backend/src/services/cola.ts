import Pedido from '../models/Pedido';
import Parametro from '../models/Parametro';
import Usuario from '../models/Usuario';
import Evento from '../models/Evento';
import { CLAVES_PARAMETROS } from './configuracionOperativa';
import { ordenarCola, PedidoEnCola, PedidoOrdenadoEnCola } from '../cola/construirCola';
import { calcularCambiosAging, PedidoParaAging } from '../cola/cambiosAging';

/**
 * Cola de descarga con prioridad (Sprint 6).
 *
 * Este es el UNICO archivo del modulo que toca Mongoose: el resto de la
 * logica (orden, aging) vive en src/cola/ como funciones puras, para poder
 * probarlas sin levantar la base. Este servicio solo lee/escribe y les pasa
 * los datos.
 */

interface ValorParametro {
  valor: string;
}

/**
 * Lee un parametro entero directo de la coleccion, SIN pasar por el cache
 * de 60 s de obtenerConfiguracionOperativa(): factor_aging_min y
 * limite_espera_max se ajustan en vivo durante la demo, y esperar hasta un
 * minuto a que venza el cache no es aceptable para ese caso de uso.
 */
const leerParametroEntero = async (
  clave: string,
  porDefecto: number,
  minimo: number,
  maximo: number
): Promise<number> => {
  const fila = await Parametro.findOne({ clave, activo: true })
    .select('valor')
    .lean<ValorParametro | null>();

  const numero = Number(fila?.valor);

  if (!fila || !Number.isInteger(numero) || numero < minimo || numero > maximo) {
    console.warn(
      `[Cola] Falta o es invalido el parametro ${clave}: se usa el valor por defecto (${porDefecto}). Corre "npm run seed:parametros".`
    );
    return porDefecto;
  }

  return numero;
};

/**
 * Exportado: lo reutiliza services/descargas.ts (promoverSiguienteDeLaCola)
 * para leer el mismo factor, sin cache, en el momento de promover.
 */
export const leerFactorAgingMin = (): Promise<number> =>
  leerParametroEntero(CLAVES_PARAMETROS.factorAgingMin, 20, 1, 1440);

const leerLimiteEsperaMax = (): Promise<number> =>
  leerParametroEntero(CLAVES_PARAMETROS.limiteEsperaMax, 60, 1, 1440);

/** Forma de un documento Pedido ya leido de la base, lo minimo que necesita este archivo. */
interface PedidoEnColaLeido {
  _id: { toString(): string };
  numeroPedido: string;
  tipoProducto: string;
  puntualidad?: string;
  fechaHoraProgramada: Date;
  fechaHoraIngresoCola?: Date;
  fechaHoraLlegadaReal?: Date;
  prioridadCalculada?: number;
  proveedorId?: { _id: { toString(): string }; razonSocial: string } | null;
}

/**
 * Los pedidos activos que estan hoy en la cola (estado EN COLA), con el
 * proveedor poblado para poder mostrar su nombre.
 *
 * Exportado: promoverSiguienteDeLaCola (services/descargas.ts) tambien
 * necesita esta misma lista para calcular los candidatos de un gateway.
 */
export const leerPedidosEnCola = (): Promise<PedidoEnColaLeido[]> =>
  Pedido.find({ activo: true, estado: 'EN COLA' })
    .populate('proveedorId', 'razonSocial')
    .select(
      'numeroPedido tipoProducto puntualidad fechaHoraProgramada fechaHoraIngresoCola fechaHoraLlegadaReal prioridadCalculada proveedorId'
    )
    .lean<PedidoEnColaLeido[]>();

export const aPedidoEnCola = (pedido: PedidoEnColaLeido): PedidoEnCola => ({
  _id: pedido._id.toString(),
  numeroPedido: pedido.numeroPedido,
  tipoProducto: pedido.tipoProducto,
  // Un pedido EN COLA siempre registro su llegada (ver llegadaController),
  // asi que puntualidad deberia estar siempre; el fallback es solo para no
  // romper si algun dato viejo quedara sin ella.
  puntualidad: pedido.puntualidad ?? 'TARDÍO',
  fechaHoraProgramada: pedido.fechaHoraProgramada,
  fechaHoraIngresoCola: pedido.fechaHoraIngresoCola,
  fechaHoraLlegadaReal: pedido.fechaHoraLlegadaReal
});

export interface ItemCola {
  posicion: number;
  pedidoId: string;
  numeroPedido: string;
  proveedor: { id: string; nombre: string } | null;
  tipoProducto: string;
  puntualidad: string;
  prioridadBase: number;
  prioridadCalculada: number;
  minutosEnEspera: number;
  fechaHoraProgramada: Date;
  fechaHoraIngresoCola?: Date;
  excedeLimite: boolean;
}

export interface ColaOrdenada {
  factorAgingMin: number;
  limiteEsperaMax: number;
  generadoEn: Date;
  items: ItemCola[];
}

const aItemsDeCola = (
  ordenados: PedidoOrdenadoEnCola[],
  pedidosLeidos: Map<string, PedidoEnColaLeido>,
  limiteEsperaMax: number
): ItemCola[] =>
  ordenados.map((pedido, indice) => {
    const leido = pedidosLeidos.get(pedido._id);
    const proveedor = leido?.proveedorId
      ? { id: leido.proveedorId._id.toString(), nombre: leido.proveedorId.razonSocial }
      : null;

    return {
      posicion: indice + 1,
      pedidoId: pedido._id,
      numeroPedido: leido?.numeroPedido ?? '',
      proveedor,
      tipoProducto: pedido.tipoProducto,
      puntualidad: pedido.puntualidad,
      prioridadBase: pedido.prioridadBase,
      prioridadCalculada: pedido.prioridadCalculada,
      minutosEnEspera: pedido.minutosEnEspera,
      fechaHoraProgramada: pedido.fechaHoraProgramada,
      fechaHoraIngresoCola: pedido.fechaHoraIngresoCola,
      excedeLimite: pedido.minutosEnEspera > limiteEsperaMax
    };
  });

/**
 * GET /api/cola. Solo lectura: no escribe nada en la base ni crea eventos.
 * Calcula la prioridad y el orden "al vuelo", sin tocar lo que haya
 * guardado en prioridadCalculada (eso solo lo pisa reevaluarCola).
 */
export const obtenerColaOrdenada = async (): Promise<ColaOrdenada> => {
  const [pedidosLeidos, factorAgingMin, limiteEsperaMax] = await Promise.all([
    leerPedidosEnCola(),
    leerFactorAgingMin(),
    leerLimiteEsperaMax()
  ]);

  const generadoEn = new Date();
  const pedidosPorId = new Map(pedidosLeidos.map((pedido) => [pedido._id.toString(), pedido]));
  const ordenados = ordenarCola(pedidosLeidos.map(aPedidoEnCola), factorAgingMin, generadoEn);

  return {
    factorAgingMin,
    limiteEsperaMax,
    generadoEn,
    items: aItemsDeCola(ordenados, pedidosPorId, limiteEsperaMax)
  };
};

export interface ResultadoReevaluar extends ColaOrdenada {
  pedidosQueSubieronDePrioridad: number;
}

/**
 * POST /api/cola/reevaluar. Recalcula la prioridad y la espera de todos los
 * pedidos EN COLA, los guarda en una sola operacion (bulkWrite) y registra
 * AGING_APLICADO solo para los que subieron de nivel respecto de lo que
 * tenian guardado.
 */
export const reevaluarCola = async (usuarioId: string): Promise<ResultadoReevaluar> => {
  const [pedidosLeidos, factorAgingMin, limiteEsperaMax] = await Promise.all([
    leerPedidosEnCola(),
    leerFactorAgingMin(),
    leerLimiteEsperaMax()
  ]);

  const ahora = new Date();
  const pedidosParaAging: PedidoParaAging[] = pedidosLeidos.map((pedido) => ({
    ...aPedidoEnCola(pedido),
    prioridadCalculada: pedido.prioridadCalculada
  }));

  const cambios = calcularCambiosAging(pedidosParaAging, factorAgingMin, ahora);
  const ordenados = ordenarCola(pedidosLeidos.map(aPedidoEnCola), factorAgingMin, ahora);

  if (ordenados.length > 0) {
    await Pedido.bulkWrite(
      ordenados.map((pedido) => ({
        updateOne: {
          filter: { _id: pedido._id },
          update: {
            prioridadCalculada: pedido.prioridadCalculada,
            minutosEnEspera: pedido.minutosEnEspera
          }
        }
      }))
    );
  }

  await registrarCambiosDeAging(cambios, usuarioId);

  const pedidosPorId = new Map(pedidosLeidos.map((pedido) => [pedido._id.toString(), pedido]));

  return {
    factorAgingMin,
    limiteEsperaMax,
    generadoEn: ahora,
    items: aItemsDeCola(ordenados, pedidosPorId, limiteEsperaMax),
    pedidosQueSubieronDePrioridad: cambios.length
  };
};

/**
 * Registra un evento AGING_APLICADO por cada pedido que subio de prioridad.
 *
 * No usa services/eventos.ts porque registrarEvento() recibe el Request y
 * reevaluarCola() solo tiene el id del usuario (puede llamarse fuera de una
 * peticion HTTP en el futuro, por ejemplo desde una tarea programada). Sigue
 * la misma regla: si guardar el evento falla, NO se deshace el recalculo
 * que ya se guardo, porque perder una linea de bitacora es menos grave que
 * dejar la cola con una prioridad guardada pero sin la operacion que la
 * origino.
 */
const registrarCambiosDeAging = async (
  cambios: ReturnType<typeof calcularCambiosAging>,
  usuarioId: string
): Promise<void> => {
  if (cambios.length === 0) {
    return;
  }

  const usuario = await Usuario.findById(usuarioId).select('nombre').lean<{ nombre: string } | null>();
  const usuarioCreacion = usuario?.nombre ?? 'Desconocido';

  await Promise.all(
    cambios.map(async (cambio) => {
      try {
        await Evento.create({
          usuarioId,
          pedidoId: cambio.pedidoId,
          accion: 'AGING_APLICADO',
          detalles: {
            prioridadAnterior: cambio.prioridadAnterior,
            prioridadNueva: cambio.prioridadNueva,
            minutosEnEspera: cambio.minutosEnEspera,
            mensaje: `Prioridad ${cambio.prioridadAnterior} → ${cambio.prioridadNueva} tras ${cambio.minutosEnEspera} min en espera`
          },
          fechaHora: new Date(),
          usuarioCreacion
        });
      } catch (error) {
        console.error('[Cola] No se pudo registrar AGING_APLICADO. El recalculo sí se guardó.', {
          pedidoId: cambio.pedidoId,
          error
        });
      }
    })
  );
};
