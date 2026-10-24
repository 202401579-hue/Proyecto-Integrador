import { Request, Response, NextFunction } from 'express';
import { esPayloadTemporal } from '../types/auth';
import { obtenerSecreto, tokenDeLaCabecera, verificarFirma } from '../services/tokens';

/**
 * Autenticacion del paso intermedio del login: solo acepta el token
 * TEMPORAL que se entrega despues de validar la contrasena.
 *
 * Es el espejo de verificarToken. Los dos miran la misma cabecera y la
 * misma firma, pero cada uno admite un unico tipo de token y rechaza el
 * otro. Esa simetria es la que hace que el token temporal sirva para una
 * sola cosa: terminar de autenticarse en /api/mfa y /api/auth/mfa.
 *
 * Protege las rutas de configuracion y verificacion del segundo factor, a
 * las que hay que poder entrar SIN tener todavia un token de acceso: si
 * pidieran uno, un usuario con MFA obligatorio sin configurar no podria
 * configurarlo nunca.
 *
 * Todo lo que no sea un token temporal valido y vigente recibe 401. Aca no
 * hay 403 como en verificarToken: quien llega con un token de acceso a una
 * ruta de MFA no esta a mitad de un login, asi que no hay ningun paso
 * pendiente que sugerirle; para el sistema, simplemente no hay una sesion
 * de verificacion en curso que continuar.
 */
export const verifyTempToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = tokenDeLaCabecera(req.headers.authorization);

  if (!token) {
    res.status(401).json({ mensaje: 'No se proporcionó un token temporal' });
    return;
  }

  const secreto = obtenerSecreto();

  if (!secreto) {
    res.status(500).json({ mensaje: 'Error interno del servidor' });
    return;
  }

  const payload = verificarFirma(token, secreto);

  // Un token temporal vencido cae aca: pasaron mas de cinco minutos desde
  // que se puso la contrasena. El mensaje lo dice, porque el usuario tiene
  // que entender que no se equivoco de codigo sino que se le acabo el tiempo.
  if (!payload) {
    res.status(401).json({
      mensaje: 'El token temporal no es válido o expiró. Vuelva a iniciar sesión.'
    });
    return;
  }

  if (!esPayloadTemporal(payload)) {
    res.status(401).json({
      mensaje: 'Se requiere el token temporal obtenido al iniciar sesión.'
    });
    return;
  }

  req.usuarioTemporal = payload;
  next();
};
