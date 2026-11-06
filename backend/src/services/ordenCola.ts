import { IGateway } from '../models/Gateway';
import { aPedidoEnCola, leerFactorAgingMin, leerPedidosEnCola } from './lecturaCola';
import { candidatosParaGateway } from '../cola/construirCola';
import { ResultadoVerificacionTurno, verificarTurno } from '../cola/validarTurno';

/**
 * Puente entre la lectura de la cola (services/lecturaCola.ts) y la
 * validacion de turno (cola/validarTurno.ts) para el inicio manual de una
 * descarga. Archivo aparte porque junta dos cosas que no deberian vivir en
 * el mismo lugar: leer Mongo y decidir si un pedido puede pasar (logica
 * pura en cola/validarTurno.ts).
 */

/**
 * Verifica si pedidoId es el primero de los candidatos de `gateway` en este
 * momento. Lee la cola y el factor de aging igual que obtenerColaOrdenada(),
 * sin cache (ver services/lecturaCola.ts).
 */
export const verificarTurnoDelPedido = async (
  pedidoId: string,
  gateway: IGateway
): Promise<ResultadoVerificacionTurno> => {
  const [pedidosEnCola, factorAgingMin] = await Promise.all([
    leerPedidosEnCola(),
    leerFactorAgingMin()
  ]);

  const candidatos = candidatosParaGateway(
    pedidosEnCola.map(aPedidoEnCola),
    gateway.tipoCargaPermitida,
    factorAgingMin,
    new Date()
  );

  return verificarTurno(pedidoId, candidatos);
};
