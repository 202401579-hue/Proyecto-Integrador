import { PayloadAcceso, PayloadTemporal } from './auth';

/**
 * Agrega al Request de Express las dos propiedades que adjuntan los
 * middlewares de autenticacion, para que los siguientes las lean con
 * tipado y sin usar `any`.
 *
 * Son dos campos distintos y no uno solo a proposito. `usuario` solo lo
 * escribe verificarToken, y solo con un token de acceso ya comprobado: por
 * eso su tipo incluye el rol y autorizarRoles puede leerlo sin preguntar
 * nada. Si los dos tokens compartieran un mismo campo, el rol seria
 * opcional en todas partes y la comprobacion quedaria a criterio de quien
 * escriba el proximo controlador.
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
