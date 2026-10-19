import {
  ESTADOS_GATEWAY,
  NUMERO_GATEWAY_CONSTRUCCION,
  NUMERO_GATEWAY_MAXIMO,
  NUMERO_GATEWAY_MINIMO,
  TIPOS_CARGA,
  tipoCargaEsperado
} from '../models/Gateway';

/**
 * PU-06 a PU-09 — Compatibilidad de carga por bahia (RN-07 y RN-08).
 *
 * HU-003 / CU-03: las bahias 1 a 4 reciben carga general y la bahia 5 es la
 * unica habilitada para carga de construccion. La regla vive en el modelo
 * (`tipoCargaEsperado`) y no en el controlador, justamente para que la
 * respeten por igual la API, los seeds y la promocion automatica de la cola.
 *
 * `tipoCargaEsperado` es una funcion pura: se puede importar y evaluar sin
 * conexion a MongoDB.
 */

describe('RN-08 — exclusividad del Gateway 5', () => {
  it('PU-06: el gateway 5 solo admite carga de construccion', () => {
    expect(tipoCargaEsperado(NUMERO_GATEWAY_CONSTRUCCION)).toBe('construcción');
  });

  it('PU-06: la constante de bahia exclusiva es efectivamente la 5', () => {
    expect(NUMERO_GATEWAY_CONSTRUCCION).toBe(5);
  });

  it('PU-07: ninguna bahia distinta de la 5 admite carga de construccion', () => {
    const generales = [1, 2, 3, 4].map(tipoCargaEsperado);
    expect(generales).toEqual(['general', 'general', 'general', 'general']);
    expect(generales).not.toContain('construcción');
  });

  it('PU-07: carga general nunca se resuelve a la bahia exclusiva', () => {
    const bahiasQueAceptanGeneral = [1, 2, 3, 4, 5].filter(
      (n) => tipoCargaEsperado(n) === 'general'
    );
    expect(bahiasQueAceptanGeneral).not.toContain(NUMERO_GATEWAY_CONSTRUCCION);
    expect(bahiasQueAceptanGeneral).toEqual([1, 2, 3, 4]);
  });
});

describe('RN-07 — catalogo de bahias y tipos de carga', () => {
  it('PU-08: el rango de bahias fisicas va de 1 a 5', () => {
    expect(NUMERO_GATEWAY_MINIMO).toBe(1);
    expect(NUMERO_GATEWAY_MAXIMO).toBe(5);
  });

  it('PU-08: las cinco bahias tienen un tipo de carga asignado', () => {
    const asignaciones = [1, 2, 3, 4, 5].map((n) => ({ bahia: n, carga: tipoCargaEsperado(n) }));
    expect(asignaciones).toEqual([
      { bahia: 1, carga: 'general' },
      { bahia: 2, carga: 'general' },
      { bahia: 3, carga: 'general' },
      { bahia: 4, carga: 'general' },
      { bahia: 5, carga: 'construcción' }
    ]);
  });

  it('PU-09: solo existen dos tipos de carga y son los del enunciado', () => {
    expect([...TIPOS_CARGA].sort()).toEqual(['construcción', 'general']);
  });

  it('PU-09: los estados de una bahia son LIBRE, OCUPADO y FUERA DE SERVICIO', () => {
    expect([...ESTADOS_GATEWAY]).toEqual(['LIBRE', 'OCUPADO', 'FUERA DE SERVICIO']);
  });

  it('PU-09: todo tipo esperado pertenece al catalogo cerrado de tipos de carga', () => {
    for (let bahia = NUMERO_GATEWAY_MINIMO; bahia <= NUMERO_GATEWAY_MAXIMO; bahia++) {
      expect(TIPOS_CARGA).toContain(tipoCargaEsperado(bahia));
    }
  });
});
