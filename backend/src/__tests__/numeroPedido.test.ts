import { generarNumeroPedido } from '../services/numeroPedido';
import Pedido from '../models/Pedido';

/**
 * PU-15 a PU-18 — Autogeneracion del correlativo de pedido (RN-03).
 *
 * HU-001 / CU-01: al crear un pedido, el backend genera el numero con el
 * formato PED-EQUI<equipo>-NNNNNNNNN, tomando el correlativo mas alto ya
 * usado (incluidos los pedidos inactivos) y sumandole uno.
 *
 * A diferencia de los otros servicios, este si consulta MongoDB. Para que la
 * prueba siga siendo unitaria se reemplaza `Pedido.findOne` por un mock: se
 * verifica la logica del correlativo, no el driver de la base.
 */

jest.mock('../models/Pedido', () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));

/** Encadena el .sort().select().lean() que usa el servicio. */
const simularConsulta = (resultado: { numeroPedido: string } | null): void => {
  (Pedido.findOne as jest.Mock).mockReturnValue({
    sort: () => ({
      select: () => ({
        lean: () => Promise.resolve(resultado)
      })
    })
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RN-03 — formato del numero de pedido', () => {
  it('PU-15: arranca en 000000001 cuando no hay ningun pedido previo', async () => {
    simularConsulta(null);
    await expect(generarNumeroPedido('04')).resolves.toBe('PED-EQUI04-000000001');
  });

  it('PU-15: el correlativo se rellena siempre a nueve digitos', async () => {
    simularConsulta({ numeroPedido: 'PED-EQUI04-000000001' });
    const numero = await generarNumeroPedido('04');
    expect(numero).toBe('PED-EQUI04-000000002');
    expect(numero.split('-')[2]).toHaveLength(9);
  });

  it('PU-16: incrementa a partir del correlativo mas alto existente', async () => {
    simularConsulta({ numeroPedido: 'PED-EQUI04-000000147' });
    await expect(generarNumeroPedido('04')).resolves.toBe('PED-EQUI04-000000148');
  });

  it('PU-16: maneja el salto de decena sin perder el relleno', async () => {
    simularConsulta({ numeroPedido: 'PED-EQUI04-000000099' });
    await expect(generarNumeroPedido('04')).resolves.toBe('PED-EQUI04-000000100');
  });

  it('PU-17: respeta el numero de equipo que recibe', async () => {
    simularConsulta(null);
    await expect(generarNumeroPedido('01')).resolves.toBe('PED-EQUI01-000000001');
  });

  it('PU-17: consulta filtrando por el prefijo del equipo', async () => {
    simularConsulta(null);
    await generarNumeroPedido('04');

    const filtro = (Pedido.findOne as jest.Mock).mock.calls[0][0];
    expect(filtro.numeroPedido.$regex).toBe('^PED-EQUI04-');
  });

  it('PU-18: si el correlativo guardado no es numerico, vuelve a empezar en 1', async () => {
    simularConsulta({ numeroPedido: 'PED-EQUI04-XXXXXXXXX' });
    await expect(generarNumeroPedido('04')).resolves.toBe('PED-EQUI04-000000001');
  });

  it('PU-18: el formato completo coincide con el patron del enunciado', async () => {
    simularConsulta({ numeroPedido: 'PED-EQUI04-000000009' });
    const numero = await generarNumeroPedido('04');
    expect(numero).toMatch(/^PED-EQUI\d{2}-\d{9}$/);
  });
});
