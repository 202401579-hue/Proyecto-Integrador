import { PayloadAcceso, PayloadTemporal } from './auth';

/**
 * Agrega al Request de Express las dos propiedades que adjuntan los
 * middlewares de autenticacion, para que los siguientes las lean con
 * tipado y sin usar `any`.
 *
 * Son dos campos distintos y no uno solo a proposito. `usuario` solo lo
 * escribe verificarToken, y solo con un token de acceso ya comprobado: por
 * eso su tipo incluye roles y permisos informativos. La autorizacion no los
 * usa: checkPermission recarga los roles activos desde MongoDB.
 */
declare global {
  namespace Express {
    interface Request {
      /** Token de acceso verificado. Lo adjunta verificarToken. */
      usuario?: PayloadAcceso;
      /** Token temporal de MFA verificado. Lo adjunta verifyTempToken. */
      usuarioTemporal?: PayloadTemporal;
    }
  }
}

export {};
