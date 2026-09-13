import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Valores exactos de los roles, segun la tabla de acuerdos del equipo.
 * Van con mayuscula inicial: JavaScript distingue mayusculas al comparar
 * textos, asi que guardar "operador" romperia la redireccion del frontend.
 */
export const ROLES = ['Administrador', 'Coordinador', 'Operador'] as const;

export type Rol = (typeof ROLES)[number];

export interface IUsuario extends Document {
  nombre: string;
  correo: string;
  password: string;
  rol: Rol;
  compararPassword(passwordPlano: string): Promise<boolean>;
}

const UsuarioSchema = new Schema<IUsuario>(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true
    },
    correo: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: [true, 'La contrasena es obligatoria'],
      // No se devuelve en las consultas salvo que se pida explicitamente
      // con .select('+password'). Asi el hash nunca viaja por accidente.
      select: false
    },
    rol: {
      type: String,
      required: [true, 'El rol es obligatorio'],
      enum: {
        values: [...ROLES],
        message: 'El rol debe ser Administrador, Coordinador u Operador'
      }
    }
  },
  { timestamps: true }
);

/**
 * Hashea la contrasena antes de guardar el documento.
 *
 * Se usa la version ASINCRONA de bcrypt a proposito: Node ejecuta en un solo
 * hilo, y la version sincrona bloquearia el event loop durante todo el calculo
 * del hash, dejando al servidor sin responder al resto de los usuarios.
 * Esa lentitud de bcrypt no es un defecto, es la defensa contra la fuerza bruta.
 */
UsuarioSchema.pre<IUsuario>('save', async function () {
  // Solo rehashea si la contrasena es nueva o cambio.
  // Sin esta guarda, cualquier actualizacion del documento volveria a
  // hashear el hash anterior y la contrasena original dejaria de servir.
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compara una contrasena en texto plano contra el hash guardado.
 * bcrypt extrae el salt del propio hash, por eso no hace falta pasarselo.
 */
UsuarioSchema.methods.compararPassword = async function (
  passwordPlano: string
): Promise<boolean> {
  return bcrypt.compare(passwordPlano, this.password);
};

export default mongoose.model<IUsuario>('Usuario', UsuarioSchema);
