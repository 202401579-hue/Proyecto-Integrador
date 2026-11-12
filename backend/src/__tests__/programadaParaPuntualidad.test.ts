import { programadaParaPuntualidad } from '../cola/programadaParaPuntualidad';
import { clasificarLlegada, Tolerancias } from '../services/puntualidad';

/**
 * programadaParaPuntualidad() — Sprint 6, seedDemoCola.ts.
 *
 * La prueba de fondo: lo que esta funcion calcula, clasificarLlegada() lo
 * tiene que leer de vuelta como la puntualidad que se le pidio. Es la cuenta
 * inversa, probada haciendo la cuenta de ida con el resultado.
 */

const TOLERANCIAS_DEFECTO: Tolerancias = {
  anticipadoMinutos: 15,
  tardioMinutos: 15,
  ausenteMinutos: 60
};

/** Margenes bien distintos de los por defecto, para no aprobar por casualidad. */
const TOLERANCIAS_DISTINTAS: Tolerancias = {
  anticipadoMinutos: 5,
  tardioMinutos: 10,
  ausenteMinutos: 40
};

const LLEGADA_PREVISTA = new Date(2026, 0, 1, 12, 0, 0);
const DURACION_MINUTOS = 60;

describe.each([
  ['tolerancias por defecto', TOLERANCIAS_DEFECTO],
  ['tolerancias distintas', TOLERANCIAS_DISTINTAS]
])('programadaParaPuntualidad — %s', (_etiqueta, tolerancias) => {
  it.each(['ANTICIPADO', 'A TIEMPO', 'TARDÍO'] as const)(
    'clasificarLlegada confirma %s',
    (objetivo) => {
      const ventana = programadaParaPuntualidad(objetivo, LLEGADA_PREVISTA, tolerancias, DURACION_MINUTOS);

      expect(clasificarLlegada(LLEGADA_PREVISTA, ventana.inicio, tolerancias)).toBe(objetivo);
    }
  );

  it('TARDÍO queda por debajo del límite de AUSENTE', () => {
    const ventana = programadaParaPuntualidad('TARDÍO', LLEGADA_PREVISTA, tolerancias, DURACION_MINUTOS);
    const minutosDeDiferencia = Math.round(
      (LLEGADA_PREVISTA.getTime() - ventana.inicio.getTime()) / 60000
    );

    expect(minutosDeDiferencia).toBeGreaterThan(tolerancias.tardioMinutos);
    expect(minutosDeDiferencia).toBeLessThan(tolerancias.ausenteMinutos);
  });

  it('finVentana queda duracionMinutos después de inicioVentana', () => {
    const ventana = programadaParaPuntualidad('A TIEMPO', LLEGADA_PREVISTA, tolerancias, DURACION_MINUTOS);
    expect(ventana.fin.getTime() - ventana.inicio.getTime()).toBe(DURACION_MINUTOS * 60000);
  });
});

it('AUSENTE no está soportado: lanza un error en vez de devolver una ventana sin sentido', () => {
  expect(() =>
    programadaParaPuntualidad('AUSENTE', LLEGADA_PREVISTA, TOLERANCIAS_DEFECTO, DURACION_MINUTOS)
  ).toThrow();
});
