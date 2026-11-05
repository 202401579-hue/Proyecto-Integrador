import { PedidoEnCola } from './construirCola';
import { calcularMinutosEspera, calcularPrioridad, prioridadBaseDe } from './prioridad';

/**
 * Deteccion de envejecimiento (aging) de la cola (Sprint 6). Funcion pura:
 * no toca la base. La llama reevaluarCola() en services/cola.ts, que es
 * quien decide que hacer con la lista que devuelve (guardar y registrar
 * AGING_APLICADO).
 */

export interface PedidoParaAging extends PedidoEnCola {
  /** Prioridad que quedo guardada la ultima vez que se reevaluo la cola. */
  prioridadCalculada?: number;
}

export interface CambioAging {
  pedidoId: string;
  prioridadAnterior: number;
  prioridadNueva: number;
  minutosEnEspera: number;
}

/**
 * Compara, para cada pedido, la prioridad que tiene guardada contra la que
 * le toca ahora. Devuelve solo los que SUBIERON de prioridad (la espera los
 * hizo mas prioritarios); un pedido que no cambio, o que de alguna forma
 * bajara, no aparece en la lista.
 *
 * Si el pedido no tiene prioridadCalculada guardada (todavia no se reevaluo
 * nunca), se toma como anterior su prioridad base: asi el primer aging que
 * de verdad le suma puntos por espera es el que se reporta, no el simple
 * hecho de calcularla por primera vez.
 */
export const calcularCambiosAging = (
  pedidos: PedidoParaAging[],
  factorAgingMin: number,
  ahora: Date
): CambioAging[] => {
  const cambios: CambioAging[] = [];

  for (const pedido of pedidos) {
    const ingreso = pedido.fechaHoraIngresoCola ?? pedido.fechaHoraLlegadaReal ?? ahora;
    const minutosEnEspera = calcularMinutosEspera(ingreso, ahora);
    const prioridadNueva = calcularPrioridad(pedido.puntualidad, minutosEnEspera, factorAgingMin);
    const prioridadAnterior = pedido.prioridadCalculada ?? prioridadBaseDe(pedido.puntualidad);

    if (prioridadNueva > prioridadAnterior) {
      cambios.push({ pedidoId: pedido._id, prioridadAnterior, prioridadNueva, minutosEnEspera });
    }
  }

  return cambios;
};
