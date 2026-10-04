import Pedido from '../models/Pedido';

/**
 * Genera el numeroPedido autogenerado del equipo.
 *
 * Formato: PED-EQUI<numeroEquipo>-NNNNNNNNN, con el correlativo relleno a
 * 9 digitos (String(n).padStart(9, '0')). Busca el pedido con el numero mas
 * alto que ya exista con ese prefijo, incluidos los inactivos (un pedido
 * cancelado o dado de baja ya consumio su numero: no se reutiliza), y
 * devuelve ese numero + 1. Si no hay ninguno, arranca en 000000001.
 *
 * Como el correlativo va relleno de ceros a la izquierda, numeroPedido
 * ordena exactamente igual por texto que por valor numerico: el mayor por
 * orden alfabetico (sort descendente) es siempre el numero mas alto.
 */

const CANTIDAD_DIGITOS = 9;

/** Escapa los caracteres especiales de regex antes de armar el patron del prefijo. */
const escaparParaRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const generarNumeroPedido = async (numeroEquipo: string): Promise<string> => {
  const prefijo = `PED-EQUI${numeroEquipo}-`;

  const ultimo = await Pedido.findOne({
    numeroPedido: { $regex: `^${escaparParaRegex(prefijo)}` }
  })
    .sort({ numeroPedido: -1 })
    .select('numeroPedido')
    .lean();

  let siguiente = 1;

  if (ultimo) {
    const correlativoTexto = ultimo.numeroPedido.slice(prefijo.length);
    const correlativo = Number(correlativoTexto);

    if (Number.isInteger(correlativo)) {
      siguiente = correlativo + 1;
    }
  }

  return `${prefijo}${String(siguiente).padStart(CANTIDAD_DIGITOS, '0')}`;
};
