import mongoose, { Document, Schema, Types } from 'mongoose';

/** Los únicos permisos de negocio que puede almacenar un rol. */
export const PERMISOS_VALIDOS = [
  'usuarios',
  'roles',
  'proveedores',
  'pedidos',
  'gateways',
  'descargas',
  'cola',
  'kpis'
] as const;

export type Permiso = (typeof PERMISOS_VALIDOS)[number];

/** Colación compartida por el índice y las búsquedas de nombres de rol. */
export const COLLATION_NOMBRE_ROL = { locale: 'es', strength: 2 } as const;

export interface IRole extends Document {
  nombreRol: string;
  descripcion?: string;
  permisos: Permiso[];
  activo: boolean;
  usuarioCreacion?: Types.ObjectId;
  usuarioActualizacion?: Types.ObjectId;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    nombreRol: {
      type: String,
      required: [true, 'El nombre del rol es obligatorio'],
      trim: true,
      minlength: [3, 'El nombre del rol debe tener al menos 3 caracteres'],
      maxlength: [60, 'El nombre del rol no puede exceder 60 caracteres']
    },
    descripcion: {
      type: String,
      trim: true,
      maxlength: [200, 'La descripción no puede exceder 200 caracteres']
    },
    permisos: {
      type: [String],
      required: [true, 'El rol debe tener al menos un permiso'],
      validate: {
        validator: (permisos: unknown[]) =>
          Array.isArray(permisos) &&
          permisos.length > 0 &&
          permisos.every((permiso) => PERMISOS_VALIDOS.includes(permiso as Permiso)) &&
          new Set(permisos).size === permisos.length,
        message: `Los permisos deben ser únicos y pertenecer a: ${PERMISOS_VALIDOS.join(', ')}`
      }
    },
    activo: {
      type: Boolean,
      default: true
    },
    usuarioCreacion: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario'
    },
    usuarioActualizacion: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario'
    }
  },
  {
    timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }
  }
);

// El índice permite reutilizar un nombre cuando el rol anterior fue dado de
// baja, sin aceptar duplicados activos ni variantes que solo cambien mayúsculas.
RoleSchema.index(
  { nombreRol: 1 },
  {
    unique: true,
    partialFilterExpression: { activo: true },
    collation: COLLATION_NOMBRE_ROL
  }
);

export default mongoose.model<IRole>('Role', RoleSchema, 'roles');
