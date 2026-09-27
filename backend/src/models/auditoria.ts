import { SchemaDefinition, SchemaOptions } from 'mongoose';

/**
 * Estandar de auditoria y borrado logico del proyecto.
 *
 * Las tres colecciones del modulo (proveedores, pedidos y parametros)
 * comparten estos cinco campos, asi que se definen una sola vez aca en
 * lugar de repetirlos en cada esquema: si el estandar cambia, cambia
 * en un solo lugar y las tres colecciones quedan iguales.
 */
export interface CamposAuditoria {
  /**
   * Borrado logico. En este proyecto esta prohibido borrar documentos:
   * un DELETE pasa `activo` a false y los GET solo devuelven los true.
   * El registro sigue en la base para que el historial y los populate
   * de otras colecciones nunca queden apuntando a la nada.
   */
  activo: boolean;
  /** Nombre completo del usuario que dio el alta (no su id ni su correo). */
  usuarioCreacion?: string;
  /** Nombre completo del ultimo usuario que modifico el documento. */
  usuarioActualizacion?: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

/**
 * Definicion de los campos que se agregan al esquema.
 *
 * Es una funcion y no un objeto suelto a proposito: al construir un Schema,
 * Mongoose se queda con las opciones que recibe. Compartir el MISMO objeto
 * entre tres esquemas los ataria entre si, asi que cada llamada devuelve
 * una copia nueva.
 *
 * fechaCreacion y fechaActualizacion no van aca: las maneja Mongoose
 * mediante las opciones de abajo.
 */
export const camposAuditoria = (): SchemaDefinition => ({
  activo: {
    type: Boolean,
    default: true
  },
  usuarioCreacion: {
    type: String,
    trim: true
  },
  usuarioActualizacion: {
    type: String,
    trim: true
  }
});

/**
 * Opciones del esquema: son los timestamps de siempre, pero renombrados.
 *
 * Mongoose ya sabe llenar y actualizar solo las marcas de tiempo; con
 * `timestamps: true` las guardaria como createdAt y updatedAt. Renombrarlas
 * a fechaCreacion y fechaActualizacion cumple el estandar sin escribir
 * fechas a mano en cada controlador, que es donde se olvidan.
 *
 * Los documentos que ya estaban guardados tienen createdAt/updatedAt:
 * hay que volver a sembrarlos para que tomen los nombres nuevos.
 */
export const opcionesAuditoria: SchemaOptions = {
  timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }
};
