import {
  clasificarLlegada,
  limiteDeAusencia,
  minutosDeDiferencia,
  Tolerancias
} from '../services/puntualidad';

/**
 * PU-01 a PU-05 — Clasificacion de puntualidad (RN-04).
 *
 * HU-002 / CU-02: el sistema compara la hora real de arribo contra el inicio
 * de la ventana y asigna una de las cuatro clasificaciones posibles.
 *
 * Las tolerancias se inyectan en cada llamada (no se leen de la base), asi
 * que estas pruebas son unitarias de verdad: no levantan Mongo ni Express.
 * Se usan los mismos valores por defecto que siembra `npm run seed:parametros`.
 */

const TOLERANCIAS: Tolerancias = {
  anticipadoMinutos: 15,
  tardioMinutos: 15,
  ausenteMinutos: 60
};

/** Inicio de ventana fijo para todo el archivo: 09:00 del 15/10/2026. */
const INICIO_VENTANA = new Date(2026, 9, 15, 9, 0, 0);

/** Construye una hora de llegada desplazada en minutos respecto del inicio. */
const llegadaA = (minutos: number): Date =>
  new Date(INICIO_VENTANA.getTime() + minutos * 60 * 1000);

describe('RN-04 — minutosDeDiferencia()', () => {
  it('PU-01: devuelve negativo cuando el camion llega antes de la hora', () => {
    expect(minutosDeDiferencia(llegadaA(-20), INICIO_VENTANA)).toBe(-20);
  });

  it('PU-01: devuelve positivo cuando el camion llega despues de la hora', () => {
    expect(minutosDeDiferencia(llegadaA(12), INICIO_VENTANA)).toBe(12);
  });

  it('PU-01: redondea al minuto mas cercano', () => {
    // 7 minutos y 29 segundos redondea a 7; 7 minutos y 31 segundos, a 8.
    const sieteYMedio = new Date(INICIO_VENTANA.getTime() + 7 * 60 * 1000 + 31 * 1000);
    expect(minutosDeDiferencia(sieteYMedio, INICIO_VENTANA)).toBe(8);
  });
});

describe('RN-04 — clasificarLlegada()', () => {
  it('PU-02: clasifica ANTICIPADO cuando llega mas de 15 minutos antes', () => {
    expect(clasificarLlegada(llegadaA(-16), INICIO_VENTANA, TOLERANCIAS)).toBe('ANTICIPADO');
  });

  it('PU-02: el minuto exacto del margen todavia es A TIEMPO (limite inferior)', () => {
    // Llegar 15 minutos antes NO es anticipado: la comparacion es estricta.
    expect(clasificarLlegada(llegadaA(-15), INICIO_VENTANA, TOLERANCIAS)).toBe('A TIEMPO');
  });

  it('PU-03: clasifica A TIEMPO una llegada a los 12 minutos (escenario Gherkin 1)', () => {
    // DADO cita 09:00 y tolerancia 15 min, CUANDO llega 09:12, ENTONCES A TIEMPO.
    expect(clasificarLlegada(llegadaA(12), INICIO_VENTANA, TOLERANCIAS)).toBe('A TIEMPO');
  });

  it('PU-03: el minuto 15 cuenta a favor del proveedor (limite superior)', () => {
    expect(clasificarLlegada(llegadaA(15), INICIO_VENTANA, TOLERANCIAS)).toBe('A TIEMPO');
  });

  it('PU-04: clasifica TARDIO una llegada a los 25 minutos (escenario Gherkin 2)', () => {
    // DADO cita 09:00, CUANDO llega 09:25, ENTONCES TARDIO.
    expect(clasificarLlegada(llegadaA(25), INICIO_VENTANA, TOLERANCIAS)).toBe('TARDÍO');
  });

  it('PU-04: el minuto 60 todavia es TARDIO, no AUSENTE', () => {
    expect(clasificarLlegada(llegadaA(60), INICIO_VENTANA, TOLERANCIAS)).toBe('TARDÍO');
  });

  it('PU-05: clasifica AUSENTE pasado el limite de ausencia (escenario Gherkin 3)', () => {
    expect(clasificarLlegada(llegadaA(61), INICIO_VENTANA, TOLERANCIAS)).toBe('AUSENTE');
  });

  it('PU-05: cubre las cuatro clasificaciones posibles (RNF-01, cobertura 100%)', () => {
    const obtenidas = [
      clasificarLlegada(llegadaA(-30), INICIO_VENTANA, TOLERANCIAS),
      clasificarLlegada(llegadaA(0), INICIO_VENTANA, TOLERANCIAS),
      clasificarLlegada(llegadaA(30), INICIO_VENTANA, TOLERANCIAS),
      clasificarLlegada(llegadaA(90), INICIO_VENTANA, TOLERANCIAS)
    ];

    expect(obtenidas).toEqual(['ANTICIPADO', 'A TIEMPO', 'TARDÍO', 'AUSENTE']);
  });

  it('PU-05: respeta tolerancias distintas de las de por defecto (RN-04 configurable)', () => {
    // Con la ventana ampliada a 30 minutos, una llegada de 25 pasa a ser A TIEMPO.
    const ampliadas: Tolerancias = { ...TOLERANCIAS, tardioMinutos: 30 };
    expect(clasificarLlegada(llegadaA(25), INICIO_VENTANA, ampliadas)).toBe('A TIEMPO');
  });
});

describe('RN-04 — limiteDeAusencia()', () => {
  it('PU-05: el limite cae exactamente a los ausenteMinutos del inicio', () => {
    expect(limiteDeAusencia(INICIO_VENTANA, TOLERANCIAS).getTime()).toBe(llegadaA(60).getTime());
  });

  it('PU-05: no modifica la fecha de inicio que recibe', () => {
    const copia = new Date(INICIO_VENTANA.getTime());
    limiteDeAusencia(INICIO_VENTANA, TOLERANCIAS);
    expect(INICIO_VENTANA.getTime()).toBe(copia.getTime());
  });
});
