/**
 * Calculo de prioridad de un pedido en la cola de descarga (Sprint 6).
 *
 * Funciones puras: no tocan la base ni Express. "ahora" se recibe siempre
 * como parametro (nunca se usa Date.now() adentro) para que las pruebas
 * sean deterministas.
 */

/**
 * Prioridad base segun la puntualidad con la que llego el camion (literales
 * reales de clasificarLlegada(), ver services/puntualidad.ts). A mayor
 * numero, mas prioritario.
 *
 * AUSENTE no esta: un pedido AUSENTE nunca llega a la cola de descarga (ver
 * ESTADOS_ELEGIBLES_DESCARGA en models/Pedido.ts).
 */
export const PRIORIDAD_BASE: Record<string, number> = {
  'A TIEMPO': 3,
  ANTICIPADO: 2,
  TARDÍO: 1
};

/** Base que se usa cuando la puntualidad no esta en PRIORIDAD_BASE (ver calcularPrioridad). */
const PRIORIDAD_BASE_DESCONOCIDA = 1;

const MS_POR_MINUTO = 60 * 1000;

/**
 * Minutos completos que el pedido lleva esperando en la cola.
 * Nunca negativo: si "ahora" fuera anterior a "desde" (reloj desincronizado,
 * dato de prueba), se devuelve 0 en vez de un numero negativo.
 */
export const calcularMinutosEspera = (desde: Date, ahora: Date): number =>
  Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / MS_POR_MINUTO));

/**
 * Prioridad final de un pedido: la base de su puntualidad mas un punto extra
 * por cada bloque de `factorAgingMin` minutos de espera (envejecimiento o
 * "aging": a mas tiempo esperando, mas prioridad gana, sin importar con que
 * puntualidad llego).
 *
 * Si la puntualidad no se reconoce (no esta en PRIORIDAD_BASE), se usa la
 * base mas baja (1): es la opcion mas conservadora, que no le da ventaja
 * injustificada a un dato inesperado.
 *
 * factorAgingMin tiene que ser positivo: con 0 o negativo, Math.floor(x/0)
 * daria Infinity o dividiria al reves, asi que se rechaza explicitamente.
 */
export const calcularPrioridad = (
  puntualidad: string,
  minutosEspera: number,
  factorAgingMin: number
): number => {
  if (factorAgingMin <= 0) {
    throw new Error('factorAgingMin debe ser mayor que 0');
  }

  const base = PRIORIDAD_BASE[puntualidad] ?? PRIORIDAD_BASE_DESCONOCIDA;
  return base + Math.floor(minutosEspera / factorAgingMin);
};

/** Lo que compararPedidosCola necesita de un pedido; no depende del modelo completo de Mongoose. */
export interface PedidoParaCola {
  _id: string;
  prioridadCalculada: number;
  fechaHoraProgramada: Date;
  fechaHoraIngresoCola: Date;
}

/**
 * Orden de la cola de descarga. Devuelve negativo si "a" va antes que "b".
 *
 * Criterios, en este orden:
 *   1) prioridadCalculada descendente (mayor prioridad primero).
 *   2) hora programada (la cita, fechaHoraProgramada) ascendente: entre
 *      empates, primero el que tenia turno mas temprano.
 *   3) fechaHoraIngresoCola ascendente: si tambien empatan en la cita,
 *      primero el que entro antes a la cola.
 *   4) _id como string ascendente: desempate final, determinista.
 */
export const compararPedidosCola = (a: PedidoParaCola, b: PedidoParaCola): number => {
  if (a.prioridadCalculada !== b.prioridadCalculada) {
    return b.prioridadCalculada - a.prioridadCalculada;
  }

  const diferenciaProgramada = a.fechaHoraProgramada.getTime() - b.fechaHoraProgramada.getTime();
  if (diferenciaProgramada !== 0) {
    return diferenciaProgramada;
  }

  const diferenciaIngreso = a.fechaHoraIngresoCola.getTime() - b.fechaHoraIngresoCola.getTime();
  if (diferenciaIngreso !== 0) {
    return diferenciaIngreso;
  }

  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
};
