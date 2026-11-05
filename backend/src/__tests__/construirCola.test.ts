import { elegirSiguiente, ordenarCola, PedidoEnCola } from '../cola/construirCola';

/**
 * ordenarCola() y elegirSiguiente() — orden de la cola de descarga (Sprint 6).
 *
 * Funciones puras: no tocan la base. "ahora" siempre se pasa como parametro.
 */

const AHORA = new Date(2026, 0, 1, 12, 0, 0);
const FACTOR_AGING = 20;

/** Pedido base con todos los campos, para no repetirlos en cada caso. */
const pedido = (datos: Partial<PedidoEnCola> & { _id: string }): PedidoEnCola => ({
  tipoProducto: 'general',
  puntualidad: 'A TIEMPO',
  fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0),
  fechaHoraIngresoCola: AHORA,
  ...datos
});

describe('ordenarCola — orden y desempates', () => {
  it('ordena por prioridad (ANTICIPADO primero que A TIEMPO primero que TARDÍO, con la misma espera)', () => {
    const anticipado = pedido({ _id: 'a', puntualidad: 'ANTICIPADO' });
    const aTiempo = pedido({ _id: 'b', puntualidad: 'A TIEMPO' });
    const tardio = pedido({ _id: 'c', puntualidad: 'TARDÍO' });

    const ordenados = ordenarCola([tardio, anticipado, aTiempo], FACTOR_AGING, AHORA);

    expect(ordenados.map((p) => p._id)).toEqual(['b', 'a', 'c']);
  });

  it('en empate de prioridad, desempata por hora programada ascendente', () => {
    const citaTardia = pedido({
      _id: 'a',
      fechaHoraProgramada: new Date(2026, 0, 1, 10, 0, 0)
    });
    const citaTemprana = pedido({
      _id: 'b',
      fechaHoraProgramada: new Date(2026, 0, 1, 8, 0, 0)
    });

    const ordenados = ordenarCola([citaTardia, citaTemprana], FACTOR_AGING, AHORA);

    expect(ordenados.map((p) => p._id)).toEqual(['b', 'a']);
  });

  it('en empate de prioridad y de cita, desempata por ingreso a la cola ascendente', () => {
    const cita = new Date(2026, 0, 1, 9, 0, 0);
    const ingresoTardio = pedido({
      _id: 'a',
      fechaHoraProgramada: cita,
      fechaHoraIngresoCola: new Date(2026, 0, 1, 11, 30, 0)
    });
    const ingresoTemprano = pedido({
      _id: 'b',
      fechaHoraProgramada: cita,
      fechaHoraIngresoCola: new Date(2026, 0, 1, 11, 0, 0)
    });

    const ordenados = ordenarCola([ingresoTardio, ingresoTemprano], FACTOR_AGING, AHORA);

    expect(ordenados.map((p) => p._id)).toEqual(['b', 'a']);
  });

  it('en empate total, desempata por _id ascendente', () => {
    const cita = new Date(2026, 0, 1, 9, 0, 0);
    const ingreso = new Date(2026, 0, 1, 11, 0, 0);
    const z = pedido({ _id: 'z', fechaHoraProgramada: cita, fechaHoraIngresoCola: ingreso });
    const a = pedido({ _id: 'a', fechaHoraProgramada: cita, fechaHoraIngresoCola: ingreso });

    const ordenados = ordenarCola([z, a], FACTOR_AGING, AHORA);

    expect(ordenados.map((p) => p._id)).toEqual(['a', 'z']);
  });

  it('un TARDÍO con 60 min de espera supera a un A TIEMPO recien llegado', () => {
    const haceSesentaMin = new Date(AHORA.getTime() - 60 * 60000);
    const tardioConEspera = pedido({ _id: 'a', puntualidad: 'TARDÍO', fechaHoraIngresoCola: haceSesentaMin });
    const aTiempoReciente = pedido({ _id: 'b', puntualidad: 'A TIEMPO', fechaHoraIngresoCola: AHORA });

    const ordenados = ordenarCola([aTiempoReciente, tardioConEspera], FACTOR_AGING, AHORA);

    expect(ordenados[0]._id).toBe('a');
    expect(ordenados[0].prioridadCalculada).toBeGreaterThan(ordenados[1].prioridadCalculada);
  });

  it('cambiar factorAgingMin cambia el orden', () => {
    const haceCuarentaMin = new Date(AHORA.getTime() - 40 * 60000);
    const tardioConEspera = pedido({
      _id: 'a',
      puntualidad: 'TARDÍO',
      fechaHoraProgramada: new Date(2026, 0, 1, 10, 0, 0),
      fechaHoraIngresoCola: haceCuarentaMin
    });
    const aTiempoReciente = pedido({
      _id: 'b',
      puntualidad: 'A TIEMPO',
      fechaHoraProgramada: new Date(2026, 0, 1, 8, 0, 0),
      fechaHoraIngresoCola: AHORA
    });

    // Con factor 20: TARDÍO (1) + 40/20=2 => 3; A TIEMPO (3) + 0 => 3. Empatan
    // en prioridad y gana el A TIEMPO por tener la cita mas temprana (8 < 10).
    const conFactor20 = ordenarCola([aTiempoReciente, tardioConEspera], 20, AHORA);
    expect(conFactor20.map((p) => p._id)).toEqual(['b', 'a']);

    // Con factor 5: TARDÍO (1) + 40/5=8 => 9, por delante del A TIEMPO (3) sin
    // importar la cita: la prioridad manda antes que cualquier desempate.
    const conFactor5 = ordenarCola([aTiempoReciente, tardioConEspera], 5, AHORA);
    expect(conFactor5.map((p) => p._id)).toEqual(['a', 'b']);
  });

  it('cola vacia devuelve []', () => {
    expect(ordenarCola([], FACTOR_AGING, AHORA)).toEqual([]);
  });

  it('un pedido sin fechaHoraIngresoCola usa la llegada real', () => {
    const llegada = new Date(AHORA.getTime() - 30 * 60000);
    const sinIngreso = pedido({ _id: 'a', fechaHoraIngresoCola: undefined, fechaHoraLlegadaReal: llegada });

    const [ordenado] = ordenarCola([sinIngreso], FACTOR_AGING, AHORA);

    expect(ordenado.minutosEnEspera).toBe(30);
    expect(ordenado.fechaHoraIngresoCola).toEqual(llegada);
  });
});

describe('elegirSiguiente — filtro por tipo de carga', () => {
  it('con un gateway de "construcción" ignora los pedidos "general" aunque tengan mas prioridad', () => {
    const generalMuyPrioritario = pedido({ _id: 'a', tipoProducto: 'general', puntualidad: 'ANTICIPADO' });
    const construccionMenosPrioritario = pedido({
      _id: 'b',
      tipoProducto: 'construcción',
      puntualidad: 'TARDÍO'
    });

    const siguiente = elegirSiguiente(
      [generalMuyPrioritario, construccionMenosPrioritario],
      'construcción',
      FACTOR_AGING,
      AHORA
    );

    expect(siguiente?._id).toBe('b');
  });

  it('sin pedidos compatibles devuelve null', () => {
    const soloGeneral = pedido({ _id: 'a', tipoProducto: 'general' });

    const siguiente = elegirSiguiente([soloGeneral], 'construcción', FACTOR_AGING, AHORA);

    expect(siguiente).toBeNull();
  });
});
