import { HeapBinario } from './heapBinario';
import {
  calcularMinutosEspera,
  calcularPrioridad,
  compararPedidosCola,
  prioridadBaseDe
} from './prioridad';

/**
 * Ordenamiento de la cola de descarga (Sprint 6). Funciones puras: no tocan
 * la base ni Express. Quien las llama (services/cola.ts) les pasa los
 * pedidos ya leidos y el factor de aging ya leido de parametros.
 */

/** Lo que ordenarCola necesita de un pedido. No depende del modelo de Mongoose. */
export interface PedidoEnCola {
  _id: string;
  tipoProducto: string;
  puntualidad: string;
  fechaHoraProgramada: Date;
  /** Si falta, se usa fechaHoraLlegadaReal (ver ordenarCola). */
  fechaHoraIngresoCola?: Date;
  fechaHoraLlegadaReal?: Date;
}

export interface PedidoOrdenadoEnCola extends Omit<PedidoEnCola, 'fechaHoraIngresoCola'> {
  // Ya resuelto (ver ordenarCola): a esta altura nunca falta, aunque en
  // PedidoEnCola sea opcional.
  fechaHoraIngresoCola: Date;
  prioridadBase: number;
  prioridadCalculada: number;
  minutosEnEspera: number;
}

/**
 * Ordena los pedidos de la cola por prioridad (ver prioridad.ts para el
 * criterio completo de desempate).
 *
 * Usa HeapBinario.desdeArreglo() (heapify en O(n)) y despues extrae uno por
 * uno hasta vaciarlo: la extraccion de un heap da los elementos en orden de
 * prioridad, igual que un sort pero sin ordenar de una sola vez el arreglo
 * completo.
 */
export const ordenarCola = (
  pedidos: PedidoEnCola[],
  factorAgingMin: number,
  ahora: Date
): PedidoOrdenadoEnCola[] => {
  const enriquecidos: PedidoOrdenadoEnCola[] = pedidos.map((pedido) => {
    // Si el pedido no tiene fechaHoraIngresoCola (documentos de antes del
    // Sprint 6), se usa la llegada real: es el dato mas parecido que existe
    // a "cuando empezo a esperar".
    const ingreso = pedido.fechaHoraIngresoCola ?? pedido.fechaHoraLlegadaReal ?? ahora;
    const minutosEnEspera = calcularMinutosEspera(ingreso, ahora);

    return {
      ...pedido,
      fechaHoraIngresoCola: ingreso,
      prioridadBase: prioridadBaseDe(pedido.puntualidad),
      prioridadCalculada: calcularPrioridad(pedido.puntualidad, minutosEnEspera, factorAgingMin),
      minutosEnEspera
    };
  });

  const heap = HeapBinario.desdeArreglo(enriquecidos, compararPedidosCola);

  const ordenados: PedidoOrdenadoEnCola[] = [];
  let siguiente = heap.extraer();
  while (siguiente !== undefined) {
    ordenados.push(siguiente);
    siguiente = heap.extraer();
  }

  return ordenados;
};

/**
 * Primer pedido de la cola compatible con el tipo de carga de un gateway, o
 * null si no hay ninguno. Filtra por tipo de carga ANTES de ordenar: un
 * pedido incompatible no debe ocupar el primer lugar aunque tenga mas
 * prioridad que todos los compatibles.
 */
export const elegirSiguiente = (
  pedidos: PedidoEnCola[],
  tipoCarga: string,
  factorAgingMin: number,
  ahora: Date
): PedidoOrdenadoEnCola | null => {
  const compatibles = pedidos.filter((pedido) => pedido.tipoProducto === tipoCarga);
  const ordenados = ordenarCola(compatibles, factorAgingMin, ahora);
  return ordenados[0] ?? null;
};
