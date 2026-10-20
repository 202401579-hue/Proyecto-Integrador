import {
  buscarAlternativas,
  buscarSiguienteHueco,
  calcularVentana,
  esDiaHabil,
  estaDentroDelHorario,
  HorarioOperativo,
  limitesDelDia,
  seSolapan,
  textoHorario,
  VentanaHoraria
} from '../services/ventanaHoraria';

/**
 * PU-10 a PU-14 — Ventanas horarias y solapamiento (RN-01, RN-02 y RN-14).
 *
 * HU-001 / CU-01: al programar o reprogramar una cita, el sistema verifica
 * que la ventana caiga dentro del horario operativo, que el dia sea habil y
 * que no se pise con otra cita ya programada. Si choca, ofrece alternativas.
 *
 * Todas las funciones del servicio son puras y reciben el horario por
 * parametro, asi que las pruebas no dependen de la coleccion `parametros`.
 */

/** Horario por defecto del deposito: 07:00 a 17:00, de lunes a sabado. */
const HORARIO: HorarioOperativo = {
  horaApertura: 7,
  horaCierre: 17,
  diasHabiles: [1, 2, 3, 4, 5, 6]
};

/** 15/10/2026 es jueves (dia habil). */
const JUEVES = new Date(2026, 9, 15, 9, 0, 0);
/** 18/10/2026 es domingo (dia no habil). */
const DOMINGO = new Date(2026, 9, 18, 9, 0, 0);

/** Atajo para armar una ventana el jueves a la hora indicada. */
const ventanaJueves = (hora: number, minutos: number, duracion: number): VentanaHoraria =>
  calcularVentana(new Date(2026, 9, 15, hora, minutos, 0), duracion);

describe('RN-01 — horario operativo y dias habiles', () => {
  it('PU-10: un jueves es dia habil', () => {
    expect(esDiaHabil(JUEVES, HORARIO)).toBe(true);
  });

  it('PU-10: un domingo no es dia habil', () => {
    expect(esDiaHabil(DOMINGO, HORARIO)).toBe(false);
  });

  it('PU-10: los limites del dia son la apertura y el cierre configurados', () => {
    const { inicio, fin } = limitesDelDia(JUEVES, HORARIO);
    expect(inicio.getHours()).toBe(7);
    expect(fin.getHours()).toBe(17);
  });

  it('PU-10: el texto del horario se arma con la configuracion vigente', () => {
    expect(textoHorario(HORARIO)).toBe('07:00 a 17:00');
    expect(textoHorario({ ...HORARIO, horaCierre: 20 })).toBe('07:00 a 20:00');
  });
});

describe('RN-02 — la ventana debe entrar completa en el horario', () => {
  it('PU-11: una ventana de 09:00 a 10:00 entra en el horario', () => {
    expect(estaDentroDelHorario(ventanaJueves(9, 0, 60), HORARIO)).toBe(true);
  });

  it('PU-11: una ventana que termina despues del cierre se rechaza', () => {
    // 16:30 + 60 min = 17:30, pasa el cierre de las 17:00.
    expect(estaDentroDelHorario(ventanaJueves(16, 30, 60), HORARIO)).toBe(false);
  });

  it('PU-11: una ventana que empieza antes de la apertura se rechaza', () => {
    expect(estaDentroDelHorario(ventanaJueves(6, 30, 60), HORARIO)).toBe(false);
  });

  it('PU-11: una ventana en dia no habil se rechaza aunque la hora sea valida', () => {
    const enDomingo = calcularVentana(new Date(2026, 9, 18, 9, 0, 0), 60);
    expect(estaDentroDelHorario(enDomingo, HORARIO)).toBe(false);
  });
});

describe('RN-02 — solapamiento entre citas', () => {
  it('PU-12: dos ventanas que comparten tiempo se solapan', () => {
    expect(seSolapan(ventanaJueves(9, 0, 60), ventanaJueves(9, 30, 60))).toBe(true);
  });

  it('PU-12: dos turnos consecutivos NO se solapan (comparacion estricta)', () => {
    // 09:00-10:00 y 10:00-11:00 son validos uno detras del otro.
    expect(seSolapan(ventanaJueves(9, 0, 60), ventanaJueves(10, 0, 60))).toBe(false);
  });

  it('PU-12: una ventana contenida dentro de otra se solapa', () => {
    expect(seSolapan(ventanaJueves(9, 0, 120), ventanaJueves(9, 30, 30))).toBe(true);
  });
});

describe('RN-14 — reprogramacion: busqueda de huecos y alternativas', () => {
  it('PU-13: devuelve el horario pedido cuando esta libre', () => {
    const hueco = buscarSiguienteHueco(new Date(2026, 9, 15, 9, 0, 0), 60, [], HORARIO);
    expect(hueco).not.toBeNull();
    expect(hueco!.inicio.getHours()).toBe(9);
  });

  it('PU-13: salta al final de la ventana ocupada cuando hay choque', () => {
    const ocupadas = [ventanaJueves(9, 0, 60)];
    const hueco = buscarSiguienteHueco(new Date(2026, 9, 15, 9, 0, 0), 60, ocupadas, HORARIO);
    expect(hueco).not.toBeNull();
    expect(hueco!.inicio.getHours()).toBe(10);
  });

  it('PU-13: devuelve null si el dia no es habil', () => {
    expect(buscarSiguienteHueco(DOMINGO, 60, [], HORARIO)).toBeNull();
  });

  it('PU-13: devuelve null si ya no queda lugar antes del cierre', () => {
    const ocupadas = [ventanaJueves(16, 0, 60)];
    const hueco = buscarSiguienteHueco(new Date(2026, 9, 15, 16, 0, 0), 60, ocupadas, HORARIO);
    expect(hueco).toBeNull();
  });

  it('PU-14: ofrece tres alternativas que no se pisan entre si', () => {
    const alternativas = buscarAlternativas(
      new Date(2026, 9, 15, 9, 0, 0),
      60,
      [ventanaJueves(9, 0, 60)],
      HORARIO
    );

    expect(alternativas).toHaveLength(3);

    for (let i = 1; i < alternativas.length; i++) {
      expect(seSolapan(alternativas[i - 1], alternativas[i])).toBe(false);
    }
  });

  it('PU-14: las alternativas saltean los dias no habiles', () => {
    // Sabado 17/10 a las 16:30: no entra ese dia y el domingo no es habil,
    // asi que la primera alternativa tiene que caer el lunes 19.
    const alternativas = buscarAlternativas(new Date(2026, 9, 17, 16, 30, 0), 60, [], HORARIO);
    expect(alternativas.length).toBeGreaterThan(0);
    expect(alternativas[0].inicio.getDay()).not.toBe(0);
  });
});
