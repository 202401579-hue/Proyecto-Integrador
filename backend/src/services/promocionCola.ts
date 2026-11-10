import { Request } from 'express';
import Pedido from '../models/Pedido';
import Gateway, { IGateway } from '../models/Gateway';
import { IDescarga } from '../models/Descarga';
import { IPedido } from '../models/Pedido';
import { registrarEvento } from './eventos';
import { aPedidoEnCola, leerFactorAgingMin, leerPedidosEnCola } from './lecturaCola';
import { reevaluarCola } from './cola';
import { candidatosParaGateway } from '../cola/construirCola';
import { crearDescargaYRegistrarEventos } from './descargas';

/** Lo que devuelve promoverSiguienteDeLaCola, con los datos que necesita el campo `promocion` de la respuesta. */
export interface ResultadoPromocion {
  descarga: IDescarga;
  gateway: IGateway;
  pedido: IPedido;
  prioridadCalculada: number;
  minutosEnEspera: number;
  gatewayId: string;
}

/**
 * Promocion de la cola (Sprint 6, RN-11): busca al pedido de mayor prioridad
 * que puede entrar en un gateway que acaba de quedar libre y le inicia la
 * descarga.
 *
 * Primero reevalua toda la cola (RN-14: guarda la prioridad de cada pedido y
 * registra AGING_APLICADO para los que subieron de nivel), y con esos datos
 * ya al dia calcula los candidatos compatibles con el tipo de carga del
 * gateway, ordenados por prioridad.
 *
 * Despues recorre esa lista reclamando pedidos de a uno, con una
 * actualizacion condicional (EN COLA -> DESCARGANDO). Si el reclamo de un
 * candidato falla -- otra peticion ya lo tomo, por ejemplo porque dos
 * gateways del mismo tipo de carga se liberaron casi al mismo tiempo -- se
 * pasa al siguiente candidato, en vez de rendirse. Recien con un pedido
 * reclamado se intenta ocupar el gateway (con el mismo mecanismo atomico que
 * usa el camino manual): si el gateway ya no esta LIBRE (lo tomo una
 * asignacion manual concurrente, o un administrador lo puso FUERA DE
 * SERVICIO), el pedido reclamado vuelve a EN COLA y el proceso se detiene
 * sin intentar otro candidato, porque el problema es el gateway, no el
 * pedido.
 *
 * Devuelve null si no habia ningun candidato compatible, o si el gateway ya
 * no estaba disponible para recibir a nadie.
 */
export const promoverSiguienteDeLaCola = async (
  req: Request,
  gateway: IGateway,
  usuarioId: string
): Promise<ResultadoPromocion | null> => {
  await reevaluarCola(usuarioId);

  const [pedidosEnCola, factorAgingMin] = await Promise.all([
    leerPedidosEnCola(),
    leerFactorAgingMin()
  ]);

  const ahora = new Date();
  const candidatos = candidatosParaGateway(
    pedidosEnCola.map(aPedidoEnCola),
    gateway.tipoCargaPermitida,
    factorAgingMin,
    ahora
  );

  for (const candidato of candidatos) {
    // Reclamo atomico: si otra peticion ya movio este pedido fuera de EN
    // COLA, devuelve null y se intenta con el siguiente candidato.
    const pedidoReclamado = await Pedido.findOneAndUpdate(
      { _id: candidato._id, estado: 'EN COLA', activo: true },
      { estado: 'DESCARGANDO' },
      { new: true }
    );

    if (!pedidoReclamado) {
      continue;
    }

    // Mismo mecanismo atomico que el camino manual: si el gateway ya no esta
    // LIBRE (otra asignacion lo tomo, o paso a FUERA DE SERVICIO), esta
    // actualizacion devuelve null y no promociona a nadie.
    const gatewayOcupado = await Gateway.findOneAndUpdate(
      { _id: gateway._id, activo: true, estado: 'LIBRE' },
      { estado: 'OCUPADO' },
      { new: true }
    );

    if (!gatewayOcupado) {
      await Pedido.findByIdAndUpdate(pedidoReclamado._id, { estado: 'EN COLA' });
      return null;
    }

    const resultado = await crearDescargaYRegistrarEventos(
      req,
      pedidoReclamado,
      gatewayOcupado,
      'EN COLA',
      { automatica: true }
    );

    await registrarEvento(req, 'PROMOCION_AUTOMATICA_GATEWAY', {
      pedidoId: pedidoReclamado._id,
      detalles: {
        numeroGateway: gatewayOcupado.numeroGateway,
        tipoCarga: gatewayOcupado.tipoCargaPermitida,
        puntualidad: candidato.puntualidad,
        prioridadCalculada: candidato.prioridadCalculada,
        minutosEnEspera: candidato.minutosEnEspera,
        motivo: 'Mayor prioridad entre los pedidos compatibles con la bahía liberada'
      }
    });

    return {
      descarga: resultado.descarga,
      gateway: resultado.gateway,
      pedido: resultado.pedido,
      prioridadCalculada: candidato.prioridadCalculada,
      minutosEnEspera: candidato.minutosEnEspera,
      gatewayId: String(resultado.gateway._id)
    };
  }

  // Ningun candidato compatible (o todos se los gano otra peticion): no se
  // crea ningun evento y el gateway queda LIBRE.
  return null;
};
