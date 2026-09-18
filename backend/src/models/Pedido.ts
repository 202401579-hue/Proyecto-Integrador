import mongoose, { Document, Schema, Types } from 'mongoose';
import { CATEGORIAS_PROVEEDOR, normalizarNFC } from './Proveedor';

/**
 * Estados posibles de un pedido. Por ahora el Sprint 1 solo crea pedidos
 * programados; el arreglo queda listo para sumar estados en sprints futuros
 * sin tocar el resto del esquema.
 */
export const ESTADOS_PEDIDO = ['PROGRAMADO'] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/**
 * Tipos de producto admitidos. Segun el enunciado es la misma lista cerrada
 * que la categoria del proveedor, asi que se reutiliza la misma constante:
 * si la lista cambia, cambia en los dos lugares a la vez.
 */
export const TIPOS_PRODUCTO = CATEGORIAS_PROVEEDOR;

export type TipoProducto = (typeof TIPOS_PRODUCTO)[number];

export interface IPedido extends Document {
  numeroPedido: string;
  proveedorId: Types.ObjectId;
  tipoProducto: TipoProducto;
  fechaHoraProgramada: Date;
  duracionEstimadaMinutos: number;
  inicioVentana: Date;
  finVentana: Date;
  estado: EstadoPedido;
}

const PedidoSchema = new Schema<IPedido>(
  {
    // Codigo de la orden de compra. Lo escribe el coordinador en el
    // formulario; el backend no lo genera, solo exige que no se repita.
    numeroPedido: {
      type: String,
      required: [true, 'El número de pedido es obligatorio'],
      unique: true,
      trim: true
    },
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
      set: normalizarNFC,
      enum: {
        values: [...TIPOS_PRODUCTO],
        message: 'El tipo de producto debe ser "construcción" o "general"'
      }
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

/**
 * La ventana tiene que terminar despues de empezar.
 *
 * El controlador ya lo garantiza al exigir una duracion mayor a 0, pero se
 * valida tambien aca para que ningun otro camino (un script, un seed) pueda
 * guardar una ventana invertida o de duracion cero. invalidate() la convierte
 * en un ValidationError comun, que el controlador responde como 400.
 */
PedidoSchema.pre<IPedido>('validate', function () {
  if (this.inicioVentana && this.finVentana && this.finVentana <= this.inicioVentana) {
    this.invalidate('finVentana', 'finVentana debe ser posterior a inicioVentana');
  }
});

// Las busquedas de solapamiento filtran por estado y rango de inicio;
// el indice evita recorrer toda la coleccion en cada alta de pedido.
PedidoSchema.index({ estado: 1, inicioVentana: 1 });

export default mongoose.model<IPedido>('Pedido', PedidoSchema);
