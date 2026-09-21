import mongoose, { Document, Schema } from 'mongoose';

/**
 * Valores exactos de la categoria, segun el contrato de la API.
 * Van en minuscula y con tilde: el frontend compara el texto tal cual,
 * asi que "Construccion" o "construccion" no serian aceptados.
 */
export const CATEGORIAS_PROVEEDOR = ['construcción', 'general'] as const;

export type CategoriaProveedor = (typeof CATEGORIAS_PROVEEDOR)[number];

/**
 * La "ó" puede llegar como un solo caracter o como "o" + tilde combinable
 * (segun el teclado o el sistema operativo). Se ven iguales pero no son
 * el mismo texto, asi que se normaliza a NFC antes de validar contra la lista.
 */
export const normalizarNFC = (valor: unknown): unknown =>
  typeof valor === 'string' ? valor.normalize('NFC') : valor;

export interface IProveedor extends Document {
  razonSocial: string;
  identificacionTributaria: string;
  categoria: CategoriaProveedor;
  contactoNombre: string;
  telefono: string;
  emailContacto: string;
}

const ProveedorSchema = new Schema<IProveedor>(
  {
    razonSocial: {
      type: String,
      required: [true, 'La razón social es obligatoria'],
      trim: true
    },
    identificacionTributaria: {
      type: String,
      required: [true, 'La identificación tributaria es obligatoria'],
      // Dos proveedores no pueden compartir identificacion tributaria:
      // es el dato que identifica a la empresa ante el fisco.
      unique: true,
      trim: true
    },
    categoria: {
      type: String,
      required: [true, 'La categoría es obligatoria'],
      set: normalizarNFC,
      enum: {
        values: [...CATEGORIAS_PROVEEDOR],
        message: 'La categoría debe ser "construcción" o "general"'
      }
    },
    contactoNombre: {
      type: String,
      required: [true, 'El nombre de contacto es obligatorio'],
      trim: true
    },
    telefono: {
      type: String,
      required: [true, 'El teléfono es obligatorio'],
      trim: true
    },
    emailContacto: {
      type: String,
      required: [true, 'El email de contacto es obligatorio'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El email de contacto no es válido']
    }
  },
  { timestamps: true }
);

// El tercer argumento fija el nombre de la coleccion. Sin el, Mongoose
// pluraliza en ingles y la crea como "proveedors".
export default mongoose.model<IProveedor>('Proveedor', ProveedorSchema, 'proveedores');
