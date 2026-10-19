import mongoose, { Document, Schema } from 'mongoose';
import { CATEGORIAS_PROVEEDOR, normalizarNFC } from './Proveedor';
import { CamposAuditoria, camposAuditoria, opcionesAuditoria } from './auditoria';

/**
 * Gateways: las bahias fisicas donde los camiones descargan.
 *
 * Son cinco y no cambian, porque representan algo que existe en el deposito:
 * no se "crean" bahias nuevas desde la aplicacion todos los dias. Por eso
 * numeroGateway tiene un rango cerrado y no se puede editar.
 */

/** La bahia esta libre, ocupada por una descarga, o fuera de servicio. */
export const ESTADOS_GATEWAY = ['LIBRE', 'OCUPADO', 'FUERA DE SERVICIO'] as const;

export type EstadoGateway = (typeof ESTADOS_GATEWAY)[number];

/**
 * Tipos de carga que admite una bahia. Es la misma lista cerrada que la
 * categoria del proveedor y el tipo de producto del pedido, asi que se
 * reutiliza la constante en lugar de escribirla de nuevo: si la lista
 * cambia, cambia en los tres lugares a la vez.
 */
export const TIPOS_CARGA = CATEGORIAS_PROVEEDOR;

export type TipoCarga = (typeof TIPOS_CARGA)[number];

export const NUMERO_GATEWAY_MINIMO = 1;
export const NUMERO_GATEWAY_MAXIMO = 5;

/** El unico gateway habilitado para carga de construccion (RN-08). */
export const NUMERO_GATEWAY_CONSTRUCCION = 5;

/**
 * Tipo de carga que le corresponde a cada bahia (RN-07 y RN-08): las bahias
 * 1 a 4 reciben carga general y la 5 es la unica de construccion.
 *
 * Esta en el modelo y no en el controlador porque es una regla de la bahia
 * misma, no de un endpoint: asi la respetan tanto la API como los scripts.
 */
export const tipoCargaEsperado = (numeroGateway: number): TipoCarga =>
  numeroGateway === NUMERO_GATEWAY_CONSTRUCCION ? 'construcción' : 'general';

export interface IGateway extends Document, CamposAuditoria {
  numeroGateway: number;
  tipoCargaPermitida: TipoCarga;
  estado: EstadoGateway;
}

const GatewaySchema = new Schema<IGateway>(
  {
    // Identidad fisica de la bahia: es el numero pintado en el piso del
    // deposito. No se edita (ver el controlador) y no se puede repetir.
    numeroGateway: {
      type: Number,
      required: [true, 'El número de gateway es obligatorio'],
      unique: true,
      min: [NUMERO_GATEWAY_MINIMO, `El número de gateway debe estar entre ${NUMERO_GATEWAY_MINIMO} y ${NUMERO_GATEWAY_MAXIMO}`],
      max: [NUMERO_GATEWAY_MAXIMO, `El número de gateway debe estar entre ${NUMERO_GATEWAY_MINIMO} y ${NUMERO_GATEWAY_MAXIMO}`],
      // El rango no alcanza: 2.5 entra entre 1 y 5 pero no es una bahia.
      validate: {
        validator: Number.isInteger,
        message: 'El número de gateway debe ser un número entero'
      }
    },
    tipoCargaPermitida: {
      type: String,
      required: [true, 'El tipo de carga permitida es obligatorio'],
      // La "ó" puede llegar como un caracter o como "o" + tilde combinable:
      // se ven iguales pero no son el mismo texto (ver normalizarNFC).
      set: normalizarNFC,
      enum: {
        values: [...TIPOS_CARGA],
        message: 'El tipo de carga permitida debe ser "construcción" o "general"'
      }
    },
    estado: {
      type: String,
      set: normalizarNFC,
      enum: {
        values: [...ESTADOS_GATEWAY],
        message: `El estado debe ser uno de: ${ESTADOS_GATEWAY.join(', ')}`
      },
      default: 'LIBRE'
    },
    // activo, usuarioCreacion y usuarioActualizacion (ver models/auditoria.ts)
    ...camposAuditoria()
  },
  opcionesAuditoria
);

/**
 * RN-07 y RN-08 a nivel modelo: el tipo de carga tiene que coincidir con el
 * que le corresponde al numero de bahia.
 *
 * El controlador ya lo valida para poder responder un 400 con un mensaje
 * propio, pero se valida tambien aca para que ningun otro camino (un seed,
 * un script de mantenimiento) pueda guardar una bahia inconsistente.
 * invalidate() lo convierte en un ValidationError comun, que el manejo de
 * errores compartido responde como 400.
 */
GatewaySchema.pre<IGateway>('validate', function () {
  if (this.numeroGateway === undefined || this.tipoCargaPermitida === undefined) {
    return;
  }

  const esperado = tipoCargaEsperado(this.numeroGateway);

  if (this.tipoCargaPermitida !== esperado) {
    this.invalidate(
      'tipoCargaPermitida',
      `El gateway ${this.numeroGateway} solo admite carga "${esperado}"`
    );
  }
});

// Los listados ordenan por numero y filtran los activos.
GatewaySchema.index({ activo: 1, numeroGateway: 1 });

// El tercer argumento fija el nombre de la coleccion. Sin el, Mongoose
// pluraliza en ingles y la crea como "gateways" igual, pero se deja
// explicito para no depender de esa coincidencia.
export default mongoose.model<IGateway>('Gateway', GatewaySchema, 'gateways');
