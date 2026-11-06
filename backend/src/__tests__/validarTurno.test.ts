import { verificarTurno } from '../cola/validarTurno';
import { PedidoOrdenadoEnCola } from '../cola/construirCola';

/**
 * verificarTurno() — orden estricto al iniciar manualmente una descarga
 * (Sprint 6). Funcion pura: no toca la base.
 */

const candidato = (datos: Partial<PedidoOrdenadoEnCola> & { _id: string }): PedidoOrdenadoEnCola => ({
  numeroPedido: `PED-${datos._id}`,
  tipoProducto: 'general',
  puntualidad: 'A TIEMPO',
  fechaHoraProgramada: new Date(2026, 0, 1, 9, 0, 0),
  fechaHoraIngresoCola: new Date(2026, 0, 1, 10, 0, 0),
  prioridadBase: 3,
  prioridadCalculada: 3,
  minutosEnEspera: 0,
  ...datos
});

describe('verificarTurno', () => {
  it('el primero de la lista pasa', () => {
    const primero = candidato({ _id: 'a' });
    const segundo = candidato({ _id: 'b' });

    const resultado = verificarTurno('a', [primero, segundo]);

    expect(resultado.permitido).toBe(true);
    expect(resultado.siguiente?._id).toBe('a');
  });

  it('el segundo es rechazado y la sugerencia es el primero', () => {
    const primero = candidato({ _id: 'a' });
    const segundo = candidato({ _id: 'b' });

    const resultado = verificarTurno('b', [primero, segundo]);

    expect(resultado.permitido).toBe(false);
    expect(resultado.siguiente?._id).toBe('a');
  });

  it('un pedido ausente de la lista pasa (dato inconsistente, no se bloquea)', () => {
    const primero = candidato({ _id: 'a' });

    const resultado = verificarTurno('no-esta-en-la-lista', [primero]);

    expect(resultado.permitido).toBe(true);
    expect(resultado.siguiente).toBeNull();
  });

  it('lista vacia pasa', () => {
    const resultado = verificarTurno('cualquiera', []);

    expect(resultado.permitido).toBe(true);
    expect(resultado.siguiente).toBeNull();
  });
});
