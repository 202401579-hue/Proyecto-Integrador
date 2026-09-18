import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Estados posibles de un pedido. Por ahora el Sprint 1 solo crea pedidos
 * programados; el arreglo queda listo para sumar estados en sprints futuros
 * sin tocar el resto del esquema.
 */
export const ESTADOS_PEDIDO = ['PROGRAMADO'] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export interface IPedido extends Document {
  proveedorId: Types.ObjectId;
  tipoProducto: string;
  fechaHoraProgramada: Date;
  duracionEstimadaMinutos: number;
  inicioVentana: Date;
  finVentana: Date;
  estado: EstadoPedido;
}

const PedidoSchema = new Schema<IPedido>(
  {
    proveedorId: {
      type: Schema.Types.ObjectId,
      // El ref es lo que permite hacer .populate('proveedorId')
      // y recibir el proveedor completo en lugar de solo su id.
      ref: 'Proveedor',
      required: [true, 'El proveedor es obligatorio']
    },
    tipoProducto: {
      type: String,
      required: [true, 'El tipo de producto es obligatorio'],
      trim: true
    },
    fechaHoraProgramada: {
      type: Date,
      required: [true, 'La fecha y hora programada es obligatoria']
    },
    duracionEstimadaMinutos: {
      type: Number,
      required: [true, 'La duración estimada es obligatoria'],
      min: [1, 'La duración estimada debe ser de al menos 1 minuto']
    },
    // inicioVentana y finVentana no los manda el cliente: los calcula
    // el controlador a partir de la fecha programada y la duracion.
    inicioVentana: {
      type: Date,
      required: true
    },
    finVentana: {
      type: Date,
      required: true
    },
    estado: {
      type: String,
      enum: [...ESTADOS_PEDIDO],
      default: 'PROGRAMADO'
    }
  },
  { timestamps: true }
);

// Las busquedas de solapamiento filtran por estado y rango de inicio;
// el indice evita recorrer toda la coleccion en cada alta de pedido.
PedidoSchema.index({ estado: 1, inicioVentana: 1 });

export default mongoose.model<IPedido>('Pedido', PedidoSchema);
