import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import Role, { Permiso } from '../models/Role';
import Usuario from '../models/Usuario';
import { unirPermisos } from '../services/permisos';

const responderSinUsuario = (res: Response): void => {
  res.status(401).json({ mensaje: 'El usuario no existe o está inactivo' });
};

/**
 * Autoriza si el usuario tiene al menos uno de los permisos solicitados.
 * Siempre consulta Mongo: los claims del JWT no intervienen en la decisión.
 */
export const checkPermission = (...permisosSolicitados: Permiso[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuarioId = req.usuario?.id;
    if (!usuarioId || !Types.ObjectId.isValid(usuarioId)) {
      responderSinUsuario(res);
      return;
    }

    // Se recarga el usuario en cada petición; el JWT no decide permisos.
    const usuario = await Usuario.findOne({
      _id: new Types.ObjectId(usuarioId),
      // Compatibilidad con cuentas anteriores al campo activo: solo false
      // significa baja lógica, igual que en el flujo de login.
      activo: { $ne: false }
    })
      .select('roles')
      .lean();

    if (!usuario) {
      responderSinUsuario(res);
      return;
    }

    const idsRoles = Array.isArray(usuario.roles) ? usuario.roles : [];
    const roles = await Role.find({ _id: { $in: idsRoles }, activo: true })
      .select('permisos')
      .lean();

    const permisosEfectivos = unirPermisos(...roles.map((rol) => rol.permisos));
    if (!permisosSolicitados.some((permiso) => permisosEfectivos.includes(permiso))) {
      res.status(403).json({ mensaje: 'No tiene permiso para esta operación.' });
      return;
    }

    next();
  };
};
