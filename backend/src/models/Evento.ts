import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Eventos: la bitacora de lo que paso en el deposito (RN-14).
 *
 * Es una coleccion de solo insercion. Un evento describe algo que ya
 * ocurrio -- un camion llego, una descarga empezo -- y eso no se puede
 * "corregir" despues: si se pudiera editar, la bitacora dejaria de servir
 * como auditoria, que es su unica razon de existir. Si un dato sale mal,
 * se registra un evento nuevo; el anterior queda.
 *
 * La inmutabilidad no es solo una convencion escrita en un comentario:
 * esta puesta en los middlewares del final del archivo, asi que tampoco
 * la pueden romper por accidente otros modulos ni un script.
 */

/**
 * Acciones que se registran en la bitacora.
 *
 * El enunciado escribe "DESCARGADA_INICIADA", que parece un error de
 * tipeo (el resto de la lista usa el sustantivo: GATEWAY_ASIGNADO,
 * CITA_REPROGRAMADA), asi que se usa DESCARGA_INICIADA. Esta definido en
 * un solo lugar y el resto del codigo lo importa de aca: si el docente lo
 * pide literal como en el enunciado, se cambia esta linea y nada mas.
 */
export const ACCIONES_EVENTO = [
  'LLEGADA_REGISTRADA',
  'GATEWAY_ASIGNADO',
  'DESCARGA_INICIADA',
  'DESCARGA_FINALIZADA',
  'CITA_REPROGRAMADA',
  'GATEWAY_MANTENIMIENTO'
] as const;

export type AccionEvento = (typeof ACCIONES_EVENTO)[number];

export interface IEvento extends Document {
  /** Quien provoco el evento. Sale del id del token, no del cuerpo. */
  usuarioId: Types.ObjectId;
  /**
   * Pedido al que se refiere el evento, si aplica. Es opcional porque
   * GATEWAY_MANTENIMIENTO no habla de ningun pedido: habla de la bahia.
   */
  pedidoId?: Types.ObjectId;
  accion: AccionEvento;
  /**
   * Datos propios de cada accion (la clasificacion de una llegada, la
   * duracion de una descarga, la ventana anterior de una cita). Es un
   * objeto libre a proposito: cada accion necesita guardar algo distinto
   * y obligarlas a un esquema comun llenaria la coleccion de campos
   * vacios.
   */
  detalles: Record<string, unknown>;
  /** Momento del hecho. La pone el servidor, nunca el cliente. */
  fechaHora: Date;
  activo: boolean;
  usuarioCreacion?: string;
  fechaCreacion: Date;
}

const EventoSchema = new Schema<IEvento>(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      // El ref es lo que permite poblar el nombre y el rol en el listado.
      ref: 'Usuario',
      required: [true, 'El usuario del evento es obligatorio']
    },
    pedidoId: {
      type: Schema.Types.ObjectId,
      ref: 'Pedido'
    },
    accion: {
      type: String,
      required: [true, 'La acción del evento es obligatoria'],
      enum: {
        values: [...ACCIONES_EVENTO],
        message: `La acción debe ser una de: ${ACCIONES_EVENTO.join(', ')}`
      }
    },
    detalles: {
      type: Schema.Types.Mixed,
      // La funcion devuelve un objeto nuevo en cada documento. Un objeto
      // suelto como default seria el MISMO objeto compartido por todos.
      default: () => ({})
    },
    fechaHora: {
      type: Date,
      required: [true, 'La fecha y hora del evento es obligatoria'],
      default: Date.now
    },
    // Se declara igual que en el resto del proyecto por consistencia, pero
    // aca nunca cambia: sin baja logica, porque un evento no se da de baja.
    activo: {
      type: Boolean,
      default: true
    },
    /** Nombre completo de quien provoco el evento (ver services/usuarioAuditoria). */
    usuarioCreacion: {
      type: String,
      trim: true
    }
  },
  {
    /**
     * Esta es la unica coleccion que no usa camposAuditoria() ni
     * opcionesAuditoria: el estandar del proyecto agrega
     * usuarioActualizacion y fechaActualizacion, y aca esos dos campos
     * mentirian. Un evento no tiene "ultima modificacion" porque no se
     * modifica nunca, y dejar los campos vacios haria pensar que la
     * auditoria no funciona. Por eso updatedAt va en false.
     */
    timestamps: { createdAt: 'fechaCreacion', updatedAt: false }
  }
);

// El listado filtra por pedido o por accion y ordena por fecha descendente.
// El orden de los campos sigue al de la consulta: primero el de igualdad,
// al final el del rango y el orden.
EventoSchema.index({ pedidoId: 1, fechaHora: -1 });
EventoSchema.index({ accion: 1, fechaHora: -1 });
EventoSchema.index({ fechaHora: -1 });

/**
 * Operaciones de escritura que se bloquean a nivel modelo.
 *
 * Son los middlewares de consulta (los que disparan Evento.updateOne(),
 * Evento.findOneAndUpdate(), etc.). findOneAndReplace va incluido aunque
 * el enunciado no lo nombre: reemplazar un documento es la forma mas
 * directa de alterarlo, y dejarlo afuera seria un agujero.
 */
const OPERACIONES_PROHIBIDAS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
] as const;

const MENSAJE_INMUTABLE =
  'Los eventos son un registro de auditoría de solo inserción: no se pueden modificar ni eliminar';

// Lanzar dentro de un middleware hace que Mongoose rechace la promesa de la
// operacion, asi que quien lo intente recibe el error y nada se escribe.
const bloquearEscritura = (): never => {
  throw new Error(MENSAJE_INMUTABLE);
};

for (const operacion of OPERACIONES_PROHIBIDAS) {
  // El cast es por los tipos de Mongoose: pre() no tiene una sobrecarga que
  // acepte una union de nombres de middleware, aunque cada nombre por
  // separado si es valido. Se registran de a uno, en el mismo bucle.
  EventoSchema.pre(operacion as 'updateOne', bloquearEscritura);
}

/**
 * El save de un documento que ya existe tambien es una modificacion.
 *
 * Los middlewares de arriba no lo cubren: save() no pasa por los
 * middlewares de consulta. Se permite solo cuando el documento es nuevo,
 * que es la unica escritura valida de esta coleccion.
 */
EventoSchema.pre<IEvento>('save', function () {
  if (!this.isNew) {
    throw new Error(MENSAJE_INMUTABLE);
  }
});

/**
 * Lo que estos middlewares NO alcanzan, y por que esta bien:
 *
 * - Evento.collection.deleteMany() y las demas operaciones del driver
 *   nativo esquivan a Mongoose por completo. Es a proposito: es la unica
 *   puerta que les queda a los seeds para reiniciar la coleccion en
 *   desarrollo. No se usa en ningun controlador ni servicio.
 * - bulkWrite() no dispara middlewares de documento en Mongoose. No se
 *   usa en el proyecto.
 *
 * Lo que importa es que ninguna de las dos es alcanzable desde la API: no
 * existe ruta POST, PUT, PATCH ni DELETE sobre /api/eventos.
 */

export default mongoose.model<IEvento>('Evento', EventoSchema, 'eventos');
