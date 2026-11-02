import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  PayloadAcceso,
  PayloadTemporal,
  PayloadToken,
  TIPO_TOKEN_ACCESO,
  TIPO_TOKEN_TEMPORAL
} from '../types/auth';
import { Rol } from '../models/Usuario';

/**
 * Emision y verificacion de los dos tokens del sistema.
 *
 * Todo lo relativo a JWT vive aca y no repartido entre el controlador y los
 * middlewares. Antes la duracion y el secreto estaban escritos en cada
 * lugar que los necesitaba; con dos tipos de token esa duplicacion se
 * volveria el origen de los errores mas caros: un token temporal que dure
 * ocho horas o un token de acceso al que se le olvide el claim `type`.
 */

/**
 * Duracion del token de acceso: OCHO horas, no veinticuatro.
 *
 * Es la duracion definitiva que fija el Sprint 5. Un token no se puede
 * revocar: una vez firmado vale hasta que expira, aunque al usuario lo den
 * de baja o le cambien el rol. Veinticuatro horas significaba que una
 * sesion olvidada en una maquina compartida del deposito seguia siendo
 * valida al dia siguiente. Ocho horas es, mas o menos, un turno de trabajo.
 */
export const DURACION_TOKEN_ACCESO = '8h';

/**
 * Duracion del token temporal: CINCO minutos.
 *
 * Es el tiempo que hay entre poner la contrasena y escribir el codigo del
 * autenticador. No necesita durar mas, y cuanto menos dure, menos sirve si
 * alguien lo intercepta. Ademas acota la ventana del limite de intentos.
 */
export const DURACION_TOKEN_TEMPORAL = '5m';

/**
 * Lee el secreto de firma. Devuelve null si falta, para que quien llame
 * responda 500 y deje el aviso en el log: sin JWT_SECRET el servidor no
 * puede autenticar a nadie, y arrancar con un secreto improvisado seria
 * peor que fallar.
 */
export const obtenerSecreto = (): string | null => {
  const secreto = process.env.JWT_SECRET;

  if (!secreto) {
    console.error('[Auth] Falta la variable JWT_SECRET en el archivo .env');
    return null;
  }

  return secreto;
};

/** Datos minimos del usuario que necesitan los claims del token de acceso. */
export interface DatosDeAcceso {
  id: string;
  correo: string;
  rol: Rol;
}

/**
 * Firma el token definitivo, el que abre las rutas operativas.
 *
 * El payload lleva solo datos de identidad no sensibles. Nunca la
 * contrasena ni el hash: el payload va en Base64URL, no cifrado, y
 * cualquiera puede leerlo pegando el token en jwt.io.
 */
export const firmarTokenDeAcceso = (
  usuario: DatosDeAcceso,
  secreto: string
): string =>
  jwt.sign(
    {
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
      type: TIPO_TOKEN_ACCESO
    },
    secreto,
    { expiresIn: DURACION_TOKEN_ACCESO }
  );

/**
 * Firma el token temporal que se entrega cuando el login todavia no
 * termino. Devuelve tambien el jti porque el limite de intentos lo
 * necesita para contar por token.
 */
export const firmarTokenTemporal = (
  usuarioId: string,
  secreto: string
): { token: string; jti: string } => {
  // randomUUID viene del modulo crypto de Node: es aleatoriedad apta para
  // uso criptografico, no Math.random(). Un jti adivinable permitiria
  // gastarle los intentos a la sesion de otro.
  const jti = randomUUID();

  const token = jwt.sign(
    {
      id: usuarioId,
      type: TIPO_TOKEN_TEMPORAL,
      jti
    },
    secreto,
    { expiresIn: DURACION_TOKEN_TEMPORAL }
  );

  return { token, jti };
};

/**
 * Verifica firma y vencimiento y devuelve el payload, o null si el token
 * no sirve. No decide si ese token alcanza para la ruta: de eso se ocupan
 * los middlewares, que es donde esta la regla de cada caso.
 */
export const verificarFirma = (token: string, secreto: string): PayloadToken | null => {
  try {
    // jwt.verify falla tanto si la firma no coincide como si el token expiro.
    return jwt.verify(token, secreto) as PayloadToken;
  } catch {
    return null;
  }
};

/**
 * Saca el token de la cabecera `Authorization: Bearer <token>`.
 * Devuelve null si la cabecera falta o no tiene esa forma.
 */
export const tokenDeLaCabecera = (cabecera: string | undefined): string | null => {
  if (!cabecera || !cabecera.startsWith('Bearer ')) {
    return null;
  }

  // "Bearer eyJhbGciOi..." -> se queda con la segunda parte.
  const token = cabecera.slice('Bearer '.length).trim();

  return token === '' ? null : token;
};

/** Reexportados por comodidad de quien importe este servicio. */
export type { PayloadAcceso, PayloadTemporal, PayloadToken };
