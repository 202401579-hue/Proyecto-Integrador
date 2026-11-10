import { calcularCambiosAging, PedidoParaAging } from '../cola/cambiosAging';

/**
 * calcularCambiosAging() — deteccion de envejecimiento de la cola (Sprint 6).
 *
 * Funcion pura: no toca la base. "ahora" siempre se pasa como parametro.
 */

const AHORA = new Date(2026, 0, 1, 12, 0, 0);
const FACTOR_AGING = 20;

const pedido = (datos: Partial<PedidoParaAging> & { _id: string }): PedidoParaAging => ({
  numeroPedido: `PED-${datos._id}`,
  tipoProducto: 'general',
  puntualidad: 'A TIEMPO',
  fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0),
  fechaHoraIngresoCola: AHORA,
  ...datos
});

describe('calcularCambiosAging', () => {
  it('solo reporta pedidos cuyo nivel de prioridad subio', () => {
    const haceCuarentaMin = new Date(AHORA.getTime() - 40 * 60000);

    // Subio: tenia 3 guardado, ahora con 40 min de espera (factor 20) le toca 5.
    const subio = pedido({
      _id: 'a',
      puntualidad: 'A TIEMPO',
      prioridadCalculada: 3,
      fechaHoraIngresoCola: haceCuarentaMin
    });

    // No cambio: recien llegado, sigue en su base (3).
    const sinCambio = pedido({
      _id: 'b',
      puntualidad: 'A TIEMPO',
      prioridadCalculada: 3,
      fechaHoraIngresoCola: AHORA
    });

    const cambios = calcularCambiosAging([subio, sinCambio], FACTOR_AGING, AHORA);

    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toEqual({
      pedidoId: 'a',
      prioridadAnterior: 3,
      prioridadNueva: 5,
      minutosEnEspera: 40
    });
  });

  it('sin pedidos que hayan subido, devuelve []', () => {
    const sinCambio = pedido({ _id: 'a', puntualidad: 'A TIEMPO', prioridadCalculada: 3, fechaHoraIngresoCola: AHORA });

    expect(calcularCambiosAging([sinCambio], FACTOR_AGING, AHORA)).toEqual([]);
  });

  it('sin prioridadCalculada guardada, usa la base como anterior', () => {
    const haceCuarentaMin = new Date(AHORA.getTime() - 40 * 60000);
    const sinGuardar = pedido({
      _id: 'a',
      puntualidad: 'A TIEMPO',
      prioridadCalculada: undefined,
      fechaHoraIngresoCola: haceCuarentaMin
    });

    const cambios = calcularCambiosAging([sinGuardar], FACTOR_AGING, AHORA);

    expect(cambios).toEqual([{ pedidoId: 'a', prioridadAnterior: 3, prioridadNueva: 5, minutosEnEspera: 40 }]);
  });

  it('lista vacia devuelve []', () => {
    expect(calcularCambiosAging([], FACTOR_AGING, AHORA)).toEqual([]);
  });
});
