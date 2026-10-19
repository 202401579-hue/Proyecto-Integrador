import { Request, Response, NextFunction } from 'express';
import { Rol } from '../models/Usuario';

/**
 * Autorizacion (RBAC): recibe los roles habilitados para una ruta y los
 * compara contra el rol que viene en el token.
 *
 * Es una fabrica de middlewares: se invoca con los roles y devuelve el
 * middleware que Express va a ejecutar. Se usa asi:
 *
 *   router.get('/reportes', verificarToken, autorizarRoles('Administrador'), handler);
 *
 * Siempre va DESPUES de verificarToken, porque depende de req.usuario.
 *
 * La diferencia con el 401: 401 es "no se quien sos", 403 es "se quien sos
 * pero este recurso no es para tu rol".
 */
export const autorizarRoles = (...rolesPermitidos: Rol[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      res.status(401).json({ mensaje: 'No se proporcionó un token' });
      return;
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      res.status(403).json({ mensaje: 'No tiene permiso para acceder a este recurso' });
      return;
    }

    next();
  };
};
