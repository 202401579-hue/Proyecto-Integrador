import mongoose, { Document, Schema, Types } from 'mongoose';
import { CamposAuditoria, camposAuditoria, opcionesAuditoria } from './auditoria';

/**
 * Descargas: el registro de que un pedido ocupo un gateway desde que
 * inicio hasta que termino.
 *
 * fechaHoraFin y duracionMinutos quedan en null mientras la descarga esta
 * en curso; GET /api/descargas/activas filtra por fechaHoraFin: null para
 * saber que bahias estan ocupadas en este momento y por cual pedido.
 */
export interface IDescarga extends Document, CamposAuditoria {
  gatewayId: Types.ObjectId;
  pedidoId: Types.ObjectId;
  operadorId: Types.ObjectId;
  fechaHoraInicio: Date;
  fechaHoraFin: Date | null;
  duracionMinutos: number | null;
}

const DescargaSchema = new Schema<IDescarga>(
  {
    gatewayId: {
      type: Schema.Types.ObjectId,
      // El ref es lo que permite .populate('gatewayId') en el GET de activas.
      ref: 'Gateway',
      required: [true, 'El gateway es obligatorio']
    },
    pedidoId: {
      type: Schema.Types.ObjectId,
      ref: 'Pedido',
      required: [true, 'El pedido es obligatorio']
    },
    // Quien registro el inicio de la descarga (Coordinador u Operador).
    operadorId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El operador es obligatorio']
    },
    // La pone el servidor con new Date() al iniciar, nunca el cliente.
    fechaHoraInicio: {
      type: Date,
      required: [true, 'La fecha y hora de inicio es obligatoria']
    },
    // null mientras la descarga sigue en curso. La pone el servidor al finalizar.
    fechaHoraFin: {
      type: Date,
      default: null
    },
    // null mientras la descarga sigue en curso. La calcula el servidor:
    // Math.round((fin - inicio) / 60000).
    duracionMinutos: {
      type: Number,
      default: null
    },
    // activo, usuarioCreacion y usuarioActualizacion (ver models/auditoria.ts)
    ...camposAuditoria()
  },
  opcionesAuditoria
);

// GET /api/descargas/activas filtra justo por esto: activas y sin fin.
DescargaSchema.index({ activo: 1, fechaHoraFin: 1 });

// El tercer argumento fija el nombre de la coleccion, igual que en los
// demas modelos del proyecto.
export default mongoose.model<IDescarga>('Descarga', DescargaSchema, 'descargas');
