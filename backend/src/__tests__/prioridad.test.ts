import {
  calcularMinutosEspera,
  calcularPrioridad,
  compararPedidosCola,
  PedidoParaCola,
  PRIORIDAD_BASE
} from '../cola/prioridad';

/**
 * Prioridad de la cola de descarga (Sprint 6).
 *
 * Funciones puras: "ahora" siempre se pasa como parametro, nunca se usa
 * Date.now() adentro de las funciones probadas.
 */

const FACTOR_AGING = 20;

describe('PRIORIDAD_BASE — orden base por puntualidad', () => {
  it('A TIEMPO > ANTICIPADO > TARDÍO', () => {
    expect(PRIORIDAD_BASE['A TIEMPO']).toBeGreaterThan(PRIORIDAD_BASE.ANTICIPADO);
    expect(PRIORIDAD_BASE.ANTICIPADO).toBeGreaterThan(PRIORIDAD_BASE.TARDÍO);
  });
});

describe('calcularPrioridad — aging con factor 20', () => {
  it('19 minutos de espera no suman nada (+0)', () => {
    expect(calcularPrioridad('A TIEMPO', 19, FACTOR_AGING)).toBe(PRIORIDAD_BASE['A TIEMPO'] + 0);
  });

  it('20 minutos de espera suman un punto (+1)', () => {
    expect(calcularPrioridad('A TIEMPO', 20, FACTOR_AGING)).toBe(PRIORIDAD_BASE['A TIEMPO'] + 1);
  });

  it('39 minutos de espera siguen sumando un solo punto (+1)', () => {
    expect(calcularPrioridad('A TIEMPO', 39, FACTOR_AGING)).toBe(PRIORIDAD_BASE['A TIEMPO'] + 1);
  });

  it('40 minutos de espera suman dos puntos (+2)', () => {
    expect(calcularPrioridad('A TIEMPO', 40, FACTOR_AGING)).toBe(PRIORIDAD_BASE['A TIEMPO'] + 2);
  });

  it('una puntualidad no reconocida usa la base mas baja (1)', () => {
    expect(calcularPrioridad('ALGO_INVENTADO', 0, FACTOR_AGING)).toBe(1);
  });

  it('factor 0 lanza error', () => {
    expect(() => calcularPrioridad('A TIEMPO', 10, 0)).toThrow();
  });

  it('factor negativo lanza error', () => {
    expect(() => calcularPrioridad('A TIEMPO', 10, -5)).toThrow();
  });
});

describe('calcularMinutosEspera', () => {
  it('con fecha futura ("desde" posterior a "ahora") devuelve 0, nunca negativo', () => {
    const ahora = new Date(2026, 0, 1, 10, 0, 0);
    const desdeFuturo = new Date(2026, 0, 1, 10, 30, 0);
    expect(calcularMinutosEspera(desdeFuturo, ahora)).toBe(0);
  });

  it('calcula los minutos completos transcurridos', () => {
    const desde = new Date(2026, 0, 1, 10, 0, 0);
    const ahora = new Date(2026, 0, 1, 10, 45, 0);
    expect(calcularMinutosEspera(desde, ahora)).toBe(45);
  });
});

describe('compararPedidosCola — desempate por aging y por hora programada', () => {
  const pedido = (datos: Partial<PedidoParaCola> & { _id: string }): PedidoParaCola => ({
    prioridadCalculada: 0,
    fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0),
    fechaHoraIngresoCola: new Date(2026, 0, 1, 9, 0, 0),
    ...datos
  });

  it('un TARDÍO con 40 min de espera empata en prioridad con un A TIEMPO recien llegado y gana por hora programada mas temprana', () => {
    const prioridadTardio = calcularPrioridad('TARDÍO', 40, FACTOR_AGING);
    const prioridadATiempo = calcularPrioridad('A TIEMPO', 0, FACTOR_AGING);
    expect(prioridadTardio).toBe(prioridadATiempo);

    const tardioConCitaTemprana = pedido({
      _id: 'b',
      prioridadCalculada: prioridadTardio,
      fechaHoraProgramada: new Date(2026, 0, 1, 8, 0, 0)
    });
    const aTiempoConCitaTardia = pedido({
      _id: 'a',
      prioridadCalculada: prioridadATiempo,
      fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0)
    });

    const orden = [aTiempoConCitaTardia, tardioConCitaTemprana].sort(compararPedidosCola);
    expect(orden[0]._id).toBe('b');
  });

  it('el mismo TARDÍO con 60 min de espera supera al A TIEMPO por prioridad, sin importar la hora programada', () => {
    const prioridadTardio = calcularPrioridad('TARDÍO', 60, FACTOR_AGING);
    const prioridadATiempo = calcularPrioridad('A TIEMPO', 0, FACTOR_AGING);
    expect(prioridadTardio).toBeGreaterThan(prioridadATiempo);

    const tardioConCitaTardia = pedido({
      _id: 'b',
      prioridadCalculada: prioridadTardio,
      fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0)
    });
    const aTiempoConCitaTemprana = pedido({
      _id: 'a',
      prioridadCalculada: prioridadATiempo,
      fechaHoraProgramada: new Date(2026, 0, 1, 8, 0, 0)
    });

    const orden = [aTiempoConCitaTemprana, tardioConCitaTardia].sort(compararPedidosCola);
    expect(orden[0]._id).toBe('b');
  });

  it('con prioridad y cita iguales, desempata por fechaHoraIngresoCola ascendente', () => {
    const a = pedido({
      _id: 'a',
      prioridadCalculada: 3,
      fechaHoraIngresoCola: new Date(2026, 0, 1, 9, 5, 0)
    });
    const b = pedido({
      _id: 'b',
      prioridadCalculada: 3,
      fechaHoraIngresoCola: new Date(2026, 0, 1, 9, 0, 0)
    });

    const orden = [a, b].sort(compararPedidosCola);
    expect(orden[0]._id).toBe('b');
  });

  it('con todo igual, desempata por _id ascendente (determinista)', () => {
    const a = pedido({ _id: 'z' });
    const b = pedido({ _id: 'a' });

    const orden = [a, b].sort(compararPedidosCola);
    expect(orden[0]._id).toBe('a');
  });
});
