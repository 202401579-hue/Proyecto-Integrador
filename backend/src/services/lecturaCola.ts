import Pedido from '../models/Pedido';
import Parametro from '../models/Parametro';
import { CLAVES_PARAMETROS } from './configuracionOperativa';
import { PedidoEnCola } from '../cola/construirCola';

/**
 * Lectura de la cola (Sprint 6): lo que services/cola.ts y
 * services/promocionCola.ts necesitan leer de Mongoose, separado en su
 * propio archivo porque los dos lo comparten.
 */

interface ValorParametro {
  valor: string;
}

/**
 * Lee un parametro entero directo de la coleccion, SIN pasar por el cache
 * de 60 s de obtenerConfiguracionOperativa(): factor_aging_min y
 * limite_espera_max se ajustan en vivo durante la demo, y esperar hasta un
 * minuto a que venza el cache no es aceptable para ese caso de uso.
 */
const leerParametroEntero = async (
  clave: string,
  porDefecto: number,
  minimo: number,
  maximo: number
): Promise<number> => {
  const fila = await Parametro.findOne({ clave, activo: true })
    .select('valor')
    .lean<ValorParametro | null>();

  const numero = Number(fila?.valor);

  if (!fila || !Number.isInteger(numero) || numero < minimo || numero > maximo) {
    console.warn(
      `[Cola] Falta o es invalido el parametro ${clave}: se usa el valor por defecto (${porDefecto}). Corre "npm run seed:parametros".`
    );
    return porDefecto;
  }

  return numero;
};

export const leerFactorAgingMin = (): Promise<number> =>
  leerParametroEntero(CLAVES_PARAMETROS.factorAgingMin, 20, 1, 1440);

export const leerLimiteEsperaMax = (): Promise<number> =>
  leerParametroEntero(CLAVES_PARAMETROS.limiteEsperaMax, 60, 1, 1440);

/** Forma de un documento Pedido ya leido de la base, lo minimo que necesitan cola.ts y promocionCola.ts. */
export interface PedidoEnColaLeido {
  _id: { toString(): string };
  numeroPedido: string;
  tipoProducto: string;
  puntualidad?: string;
  fechaHoraProgramada: Date;
  fechaHoraIngresoCola?: Date;
  fechaHoraLlegadaReal?: Date;
  prioridadCalculada?: number;
  proveedorId?: { _id: { toString(): string }; razonSocial: string } | null;
}

/**
 * Los pedidos activos que estan hoy en la cola (estado EN COLA), con el
 * proveedor poblado para poder mostrar su nombre.
 */
export const leerPedidosEnCola = (): Promise<PedidoEnColaLeido[]> =>
  Pedido.find({ activo: true, estado: 'EN COLA' })
    .populate('proveedorId', 'razonSocial')
    .select(
      'numeroPedido tipoProducto puntualidad fechaHoraProgramada fechaHoraIngresoCola fechaHoraLlegadaReal prioridadCalculada proveedorId'
    )
    .lean<PedidoEnColaLeido[]>();

export const aPedidoEnCola = (pedido: PedidoEnColaLeido): PedidoEnCola => ({
  _id: pedido._id.toString(),
  numeroPedido: pedido.numeroPedido,
  tipoProducto: pedido.tipoProducto,
  // Un pedido EN COLA siempre registro su llegada (ver llegadaController),
  // asi que puntualidad deberia estar siempre; el fallback es solo para no
  // romper si algun dato viejo quedara sin ella.
  puntualidad: pedido.puntualidad ?? 'TARDÍO',
  fechaHoraProgramada: pedido.fechaHoraProgramada,
  fechaHoraIngresoCola: pedido.fechaHoraIngresoCola,
  fechaHoraLlegadaReal: pedido.fechaHoraLlegadaReal
});
