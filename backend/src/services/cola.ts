import Pedido from '../models/Pedido';
import Usuario from '../models/Usuario';
import Evento from '../models/Evento';
import { ordenarCola, PedidoOrdenadoEnCola } from '../cola/construirCola';
import { calcularCambiosAging, PedidoParaAging } from '../cola/cambiosAging';
import {
  aPedidoEnCola,
  leerFactorAgingMin,
  leerLimiteEsperaMax,
  leerPedidosEnCola,
  PedidoEnColaLeido
} from './lecturaCola';

/**
 * Cola de descarga con prioridad (Sprint 6): obtenerColaOrdenada() (GET) y
 * reevaluarCola() (POST /reevaluar). La lectura de Mongoose que las dos
 * comparten vive en services/lecturaCola.ts; el resto de la logica (orden,
 * aging) vive en src/cola/ como funciones puras.
 */

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
