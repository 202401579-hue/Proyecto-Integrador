import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { CamposAuditoria, camposAuditoria, opcionesAuditoria } from './auditoria';

/**
 * Valores exactos de los roles, segun la tabla de acuerdos del equipo.
 * Van con mayuscula inicial: JavaScript distingue mayusculas al comparar
 * textos, asi que guardar "operador" romperia la redireccion del frontend.
 */
export const ROLES = ['Administrador', 'Coordinador', 'Operador'] as const;

export type Rol = (typeof ROLES)[number];

/**
 * Cantidad de codigos de recuperacion que se entregan al activar el MFA.
 * Vive aca y no en el controlador porque es una propiedad del usuario:
 * cuantas veces puede entrar sin el celular antes de quedarse afuera.
 */
export const CANTIDAD_CODIGOS_RECUPERACION = 8;

export interface IUsuario extends Document, CamposAuditoria {
  nombre: string;
  correo: string;
  password: string;
  rol: Rol;
  /**
   * El Administrador le exige MFA a este usuario. Es una decision de la
   * organizacion y por eso la toma el administrador, no el usuario.
   *
   * Esta separado de twoFactorEnabled porque son dos cosas distintas:
   * esto es "tiene que usarlo" y el otro es "ya lo configuro". Entre los
   * dos momentos el usuario existe, puede iniciar sesion y lo unico que
   * lo dejan hacer es terminar de configurarlo.
   */
  mfaObligatorio: boolean;
  /**
   * Secreto compartido con la aplicacion autenticadora, en Base32.
   *
   * Es el equivalente a una contrasena: quien lo tenga puede generar
   * codigos validos para siempre, porque el TOTP no es mas que una funcion
   * del secreto y la hora. Por eso va con select: false, igual que el hash
   * de la contrasena, y solo se trae donde de verdad hace falta.
   */
  twoFactorSecret?: string;
  /** El usuario ya confirmo un codigo y el segundo factor esta activo. */
  twoFactorEnabled: boolean;
  /**
   * Codigos de un solo uso para entrar cuando no se tiene el celular.
   *
   * Se guardan HASHEADOS con bcrypt, nunca en texto plano: si alguien
   * leyera la base, un codigo de recuperacion en claro le saltearia el
   * segundo factor completo, que es justo lo que este campo deberia
   * proteger. El usuario los ve una sola vez, cuando se generan.
   */
  twoFactorRecoveryCodes: string[];
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
      lowercase: true,
      // Mismo formato que emailContacto en Proveedor. Validarlo en el
      // esquema y no en el controlador hace que lo respeten tambien los
      // seeds y cualquier script, no solo el endpoint de alta.
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no es válido']
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
    },
    mfaObligatorio: {
      type: Boolean,
      // Por defecto nadie tiene MFA obligatorio: si fuera true, el seed
      // dejaria a los tres usuarios de prueba sin poder operar hasta
      // configurar el autenticador, y las pruebas existentes no pasarian.
      default: false
    },
    twoFactorSecret: {
      type: String,
      select: false
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorRecoveryCodes: {
      type: [String],
      select: false,
      default: []
    },
    // activo, usuarioCreacion y usuarioActualizacion (ver models/auditoria.ts)
    ...camposAuditoria()
  },
  {
    // Las fechas pasan a llamarse fechaCreacion y fechaActualizacion, como
    // en el resto de las colecciones. Usuario era la unica que seguia con
    // los nombres en ingles que pone Mongoose por defecto.
    ...opcionesAuditoria,
    // Red de seguridad para los tres campos secretos.
    //
    // El select: false ya hace que no vengan en una consulta comun, pero
    // depende de que ninguna consulta los pida de mas. Este transform actua
    // al convertir el documento a JSON, que es lo que hace res.json(), asi
    // que cubre tambien el caso de un controlador que cargo el documento
    // con +password para algo y despues lo devuelve entero por descuido.
    //
    // Son dos defensas para lo mismo a proposito: que el hash de la
    // contrasena o el secreto del segundo factor salgan en una respuesta es
    // de los errores mas caros que puede cometer este backend, y no deberia
    // depender de que alguien se acuerde de filtrarlos en cada endpoint.
    toJSON: {
      transform: (_documento, objeto: Record<string, unknown>) => {
        delete objeto.password;
        delete objeto.twoFactorSecret;
        delete objeto.twoFactorRecoveryCodes;
        return objeto;
      }
    }
  }
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
 *
 * Si el documento se cargo sin pedir +password, this.password es undefined
 * y bcrypt.compare lanza una excepcion en lugar de devolver false. Se
 * devuelve false y se avisa por consola: el llamador se olvido del select,
 * y hacer que la comparacion "falle sola" convertiria ese olvido en un 401
 * silencioso imposible de diagnosticar.
 */
UsuarioSchema.methods.compararPassword = async function (
  this: IUsuario,
  passwordPlano: string
): Promise<boolean> {
  if (!this.password) {
    console.error(
      '[Usuario] Se intento comparar la contrasena de un documento cargado ' +
        'sin .select("+password"). La comparacion se rechaza.'
    );
    return false;
  }

  return bcrypt.compare(passwordPlano, this.password);
};

export default mongoose.model<IUsuario>('Usuario', UsuarioSchema);
