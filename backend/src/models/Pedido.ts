import mongoose, { Document, Schema, Types } from 'mongoose';
import { CATEGORIAS_PROVEEDOR, normalizarNFC } from './Proveedor';
import { CamposAuditoria, camposAuditoria, opcionesAuditoria } from './auditoria';

/**
 * Estados posibles de un pedido.
 *
 * El pedido nace PROGRAMADO. Cuando el camion llega, el control de arribos
 * lo reclasifica segun la puntualidad (ANTICIPADO, A TIEMPO o TARDIO); si
 * nunca llega y se pasa del limite, queda AUSENTE. CANCELADO es el unico
 * que decide una persona.
 *
 * Los textos son los del enunciado y se escriben tal cual: "A TIEMPO" lleva
 * espacio y "TARDÍO" lleva tilde. El frontend compara el texto exacto.
 */
export const ESTADOS_PEDIDO = [
  'PROGRAMADO',
  'ANTICIPADO',
  'A TIEMPO',
  'TARDÍO',
  'AUSENTE',
  'CANCELADO',
  // Sprint 3: ciclo de descarga en el gateway. EN COLA queda en el enum
  // porque el enunciado lo lista, aunque todavia nadie lo asigna. DESCARGANDO
  // lo pone POST /api/descargas/iniciar y FINALIZADO, POST /api/descargas/finalizar.
  'EN COLA',
  'DESCARGANDO',
  'FINALIZADO'
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/**
 * Estados que siguen ocupando la franja horaria del deposito.
 *
 * Es la lista que usa el control de solapamiento. Antes alcanzaba con
 * comparar contra PROGRAMADO, pero ahora un pedido que ya llego cambia de
 * estado: si se siguiera filtrando solo por PROGRAMADO, su franja quedaria
 * "libre" y se podria programar otra entrega encima de un camion que esta
 * descargando en ese momento.
 *
 * Quedan afuera CANCELADO (la entrega no va a ocurrir) y AUSENTE (el camion
 * nunca aparecio), porque en esos dos casos el anden vuelve a estar libre.
 */
export const ESTADOS_QUE_OCUPAN_FRANJA = ESTADOS_PEDIDO.filter(
  (estado) => estado !== 'CANCELADO' && estado !== 'AUSENTE'
);

/**
 * Tipos de producto admitidos. Segun el enunciado es la misma lista cerrada
 * que la categoria del proveedor, asi que se reutiliza la misma constante:
 * si la lista cambia, cambia en los dos lugares a la vez.
 */
export const TIPOS_PRODUCTO = CATEGORIAS_PROVEEDOR;

export type TipoProducto = (typeof TIPOS_PRODUCTO)[number];

export interface IPedido extends Document, CamposAuditoria {
  numeroPedido: string;
  proveedorId: Types.ObjectId;
  tipoProducto: TipoProducto;
  fechaHoraProgramada: Date;
  duracionEstimadaMinutos: number;
  inicioVentana: Date;
  finVentana: Date;
  estado: EstadoPedido;
  /**
   * Momento en que el camion se presento realmente. Lo escribe el control de
   * arribos con la hora del servidor, no el cliente. Queda vacio mientras el
   * pedido no registre llegada.
   */
  fechaHoraLlegadaReal?: Date;
}

const PedidoSchema = new Schema<IPedido>(
  {
    // Codigo de la orden de compra. Desde el Sprint 3 se genera automaticamente
    // en el servidor (ver services/numeroPedido.ts): el cliente ya no lo manda.
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
      // Se normaliza la tilde de TARDÍO igual que en categoria y tipoProducto:
      // la "Í" puede llegar como un caracter o como "I" + tilde combinable.
      set: normalizarNFC,
      enum: {
        values: [...ESTADOS_PEDIDO],
        message: `El estado debe ser uno de: ${ESTADOS_PEDIDO.join(', ')}`
      },
      default: 'PROGRAMADO'
    },
    // La llegada real no se pide en el alta: el pedido se programa antes de
    // que el camion exista, y la hora la pone el servidor al registrarla.
    fechaHoraLlegadaReal: {
      type: Date
    },
    // activo, usuarioCreacion y usuarioActualizacion (ver models/auditoria.ts)
    ...camposAuditoria()
  },
  opcionesAuditoria
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

// Las busquedas de solapamiento filtran por activo, estado y rango de inicio;
// el indice evita recorrer toda la coleccion en cada alta de pedido. El orden
// de los campos sigue al de la consulta: primero los de igualdad, al final
// el del rango, que es como MongoDB puede aprovechar el indice completo.
PedidoSchema.index({ activo: 1, estado: 1, inicioVentana: 1 });

export default mongoose.model<IPedido>('Pedido', PedidoSchema);
