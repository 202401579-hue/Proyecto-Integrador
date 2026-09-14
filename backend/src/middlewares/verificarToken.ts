import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PayloadToken } from '../types/auth';

/**
 * Autenticacion: comprueba que la peticion traiga un JWT valido.
 *
 * Espera la cabecera `Authorization: Bearer <token>`, verifica la firma
 * con el mismo secreto que se uso para firmarlo y, si todo cuadra, adjunta
 * el payload decodificado a req.usuario para los middlewares siguientes.
 *
 * Verificar la firma es lo que impide que alguien edite el payload y se
 * cambie el rol a mano: al alterar el token, la firma deja de coincidir.
 */
export const verificarToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const cabecera = req.headers.authorization;

  if (!cabecera || !cabecera.startsWith('Bearer ')) {
    res.status(401).json({ mensaje: 'No se proporcionó un token' });
    return;
  }

  // "Bearer eyJhbGciOi..." -> se queda con la segunda parte.
  const token = cabecera.split(' ')[1];

  const secreto = process.env.JWT_SECRET;

  if (!secreto) {
    console.error('[Auth] Falta la variable JWT_SECRET en el archivo .env');
    res.status(500).json({ mensaje: 'Error interno del servidor' });
    return;
  }

  try {
    // jwt.verify falla tanto si la firma no coincide como si el token expiro.
    const payload = jwt.verify(token, secreto) as PayloadToken;
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
};
