import { Rol } from '../models/Usuario';

/**
 * Tipos de token que emite el sistema.
 *
 * El claim `type` existe porque desde el Sprint 5 hay DOS tokens firmados
 * con la misma clave, y la firma sola ya no alcanza para decidir si una
 * peticion puede pasar. Sin este claim, el token temporal que se entrega a
 * mitad del login serviria para entrar a cualquier ruta operativa: estaria
 * firmado por el servidor, que es lo unico que se verificaba antes.
 */
export const TIPO_TOKEN_ACCESO = 'ACCESS';
export const TIPO_TOKEN_TEMPORAL = 'MFA_TEMP';

/**
 * Token definitivo: el que habilita las rutas operativas.
 * Lleva los tres claims de siempre (id, correo y rol) mas el tipo.
 */
export interface PayloadAcceso {
  id: string;
  correo: string;
  rol: Rol;
  type: typeof TIPO_TOKEN_ACCESO;
  iat?: number;
  exp?: number;
}

/**
 * Token temporal: solo sirve para terminar de autenticarse.
 *
 * NO lleva rol a proposito. Aunque algo lo dejara pasar por error, no hay
 * de donde sacar un rol que autorizar: la ausencia del claim es una segunda
 * barrera, independiente de la comprobacion del tipo.
 *
 * El jti (JWT ID) es un identificador unico de este token concreto. Sirve
 * para contarle los intentos fallidos: el limite es por token, no por
 * usuario, asi que volver a iniciar sesion da una tanda nueva, pero
 * reutilizar el mismo token temporal no resetea nada.
 */
export interface PayloadTemporal {
  id: string;
  type: typeof TIPO_TOKEN_TEMPORAL;
  jti: string;
  iat?: number;
  exp?: number;
}

/**
 * Lo que puede salir de jwt.verify antes de saber con cual de los dos se
 * esta tratando. Es una union discriminada por `type`: TypeScript no deja
 * leer `rol` sin haber comprobado antes que el token es de acceso.
 */
export type PayloadToken = PayloadAcceso | PayloadTemporal;

/** Estrecha la union al token de acceso. */
export const esPayloadDeAcceso = (payload: PayloadToken): payload is PayloadAcceso =>
  payload.type === TIPO_TOKEN_ACCESO;

/** Estrecha la union al token temporal. */
export const esPayloadTemporal = (payload: PayloadToken): payload is PayloadTemporal =>
  payload.type === TIPO_TOKEN_TEMPORAL;
