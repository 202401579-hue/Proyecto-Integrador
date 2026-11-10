import { PedidoOrdenadoEnCola } from './construirCola';

/**
 * Orden estricto al iniciar manualmente una descarga (Sprint 6). Funcion
 * pura: no toca la base. La llama services/ordenCola.ts, que es quien lee
 * los candidatos reales.
 */

export interface ResultadoVerificacionTurno {
  permitido: boolean;
  /**
   * El pedido que corresponde atender primero. Se devuelve tanto si el
   * pedido consultado es ese mismo (permitido: true) como si no lo es
   * (permitido: false, y este es el dato para el mensaje de rechazo). Es
   * null cuando no hay ninguna sugerencia valida: lista vacia, o el pedido
   * consultado no aparece entre los candidatos.
   */
  siguiente: PedidoOrdenadoEnCola | null;
}

/**
 * Verifica si pedidoId es el primero de la lista de candidatos (ya
 * ordenada por prioridad).
 *
 * Dos casos se dejan pasar a proposito, sin bloquear:
 * - Lista vacia: no hay nadie con quien comparar.
 * - El pedido no aparece entre los candidatos: es un dato inconsistente
 *   (por ejemplo, ya no esta EN COLA, o su tipo de producto no es el de
 *   este gateway) y bloquearlo por un dato raro seria peor que dejarlo
 *   pasar; ademas, iniciarDescargaDePedido ya tiene sus propias
 *   validaciones de estado y de tipo de carga para esos casos.
 */
export const verificarTurno = (
  pedidoId: string,
  candidatos: PedidoOrdenadoEnCola[]
): ResultadoVerificacionTurno => {
  if (candidatos.length === 0) {
    return { permitido: true, siguiente: null };
  }

  const primero = candidatos[0];
  const estaEntreLosCandidatos = candidatos.some((candidato) => candidato._id === pedidoId);

  if (!estaEntreLosCandidatos) {
    return { permitido: true, siguiente: null };
  }

  return { permitido: primero._id === pedidoId, siguiente: primero };
};
