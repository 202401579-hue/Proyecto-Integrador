import { Request, Response, NextFunction } from 'express';
import { esPayloadDeAcceso, esPayloadTemporal } from '../types/auth';
import { obtenerSecreto, tokenDeLaCabecera, verificarFirma } from '../services/tokens';

/**
 * Autenticacion: comprueba que la peticion traiga un token de ACCESO valido.
 *
 * Espera la cabecera `Authorization: Bearer <token>`, verifica la firma con
 * el mismo secreto que se uso para firmarlo, comprueba que sea un token de
 * acceso y, si todo cuadra, adjunta el payload a req.usuario.
 *
 * Verificar la firma es lo que impide que alguien edite el payload y se
 * cambie el rol a mano: al alterar el token, la firma deja de coincidir.
 *
 * Lo que agrega el Sprint 5 es la comprobacion del TIPO. Hasta ahora este
 * middleware aceptaba cualquier JWT firmado con la clave del servidor, y
 * eso era suficiente mientras el servidor firmara un solo tipo de token.
 * Desde que existe el token temporal del MFA ya no lo es: ese token tambien
 * lleva la firma del servidor, y sin esta comprobacion abriria las rutas
 * operativas a alguien que puso la contrasena pero todavia no paso el
 * segundo factor, que es justo lo que el segundo factor debe impedir.
 */
export const verificarToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = tokenDeLaCabecera(req.headers.authorization);

  if (!token) {
    res.status(401).json({ mensaje: 'No se proporcionó un token' });
    return;
  }

  const secreto = obtenerSecreto();

  if (!secreto) {
    res.status(500).json({ mensaje: 'Error interno del servidor' });
    return;
  }

  const payload = verificarFirma(token, secreto);

  if (!payload) {
    res.status(401).json({ mensaje: 'Token inválido o expirado' });
    return;
  }

  // 403 y no 401: el token es autentico y no venció, el problema es que no
  // sirve para esto. Decirlo con claridad es lo que le permite al frontend
  // mandar al usuario a terminar el login en vez de pedirle la contrasena
  // otra vez, que es lo que haria ante un 401.
  if (esPayloadTemporal(payload)) {
    res.status(403).json({
      mensaje:
        'Este token es temporal y solo sirve para completar la verificación en dos pasos. ' +
        'Complete el segundo factor para obtener un token de acceso.'
    });
    return;
  }

  // Cualquier otra cosa que no sea un token de acceso se rechaza, aunque la
  // firma sea valida. Es deliberadamente estricto: incluye los tokens que
  // se emitieron antes del Sprint 5, que no llevan el claim `type`. Dejarlos
  // pasar obligaria a mantener para siempre una excepcion del estilo "si no
  // dice el tipo, asumo que es de acceso", y esa excepcion es exactamente la
  // puerta que este cambio vino a cerrar. El costo es que una sesion abierta
  // de antes recibe un 401 y tiene que volver a entrar, una sola vez.
  if (!esPayloadDeAcceso(payload)) {
    res.status(401).json({ mensaje: 'Token inválido o expirado' });
    return;
  }

  req.usuario = payload;
  next();
};
