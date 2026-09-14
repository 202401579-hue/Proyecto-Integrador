import { PayloadToken } from './auth';

/**
 * Agrega la propiedad `usuario` al Request de Express para que
 * verificarToken pueda adjuntar el payload decodificado y los
 * middlewares siguientes lo lean con tipado, sin usar `any`.
 */
declare global {
  namespace Express {
    interface Request {
      usuario?: PayloadToken;
    }
  }
}

export {};
