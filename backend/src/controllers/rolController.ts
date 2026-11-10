import { Request, Response } from 'express';
import { registrarEvento } from '../services/eventos';
import {
  actualizarRol as actualizarRolServicio,
  crearRol as crearRolServicio,
  ErrorNombreRolDuplicado,
  ErrorRolAsignado,
  ErrorRolNoEncontrado,
  inactivarRol as inactivarRolServicio,
  listarRoles as listarRolesServicio
} from '../services/roles';
import { ErrorPermisos } from '../services/permisos';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';

const MENSAJE_DUPLICADO = 'Ya existe un rol activo con ese nombre';

const activoDesdeQuery = (valor: unknown): boolean | null => {
  if (valor === undefined || valor === 'true') return true;
  if (valor === 'false') return false;
  return null;
};

const responderErrorRol = (error: unknown, res: Response): boolean => {
  if (error instanceof ErrorRolNoEncontrado) {
    res.status(404).json({ mensaje: error.message });
    return true;
  }

  if (error instanceof ErrorNombreRolDuplicado) {
    res.status(409).json({ mensaje: error.message });
    return true;
  }

  if (error instanceof ErrorRolAsignado) {
    res.status(409).json({ mensaje: error.message, usuarios: error.usuarios });
    return true;
  }

  if (error instanceof ErrorPermisos) {
    res.status(400).json({ mensaje: error.message });
    return true;
  }

  return respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO });
};

export const listarRoles = async (req: Request, res: Response): Promise<void> => {
  const activo = activoDesdeQuery(req.query.activo);
  if (activo === null) {
    res.status(400).json({ mensaje: 'El parámetro activo debe ser true o false' });
    return;
  }

  try {
    const datos = await listarRolesServicio(activo);
    res.status(200).json({ datos, total: datos.length });
  } catch (error) {
    console.error('[Roles] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

export const crearRol = async (req: Request, res: Response): Promise<void> => {
  try {
    const rol = await crearRolServicio(req.body ?? {}, req.usuario?.id ?? '');
    await registrarEvento(req, 'ROL_CREADO', { detalles: { rolId: String(rol._id), nombreRol: rol.nombreRol } });
    res.status(201).json({ rol });
  } catch (error) {
    if (responderErrorRol(error, res)) return;
    console.error('[Roles] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

export const actualizarRol = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (respondioIdInvalido(id, res, 'del rol')) return;
  if (typeof id !== 'string') return;

  try {
    const rol = await actualizarRolServicio(id, req.body ?? {}, req.usuario?.id ?? '');
    await registrarEvento(req, 'ROL_MODIFICADO', { detalles: { rolId: String(rol._id), nombreRol: rol.nombreRol } });
    res.status(200).json({ rol });
  } catch (error) {
    if (responderErrorRol(error, res)) return;
    console.error('[Roles] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

export const inactivarRol = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (respondioIdInvalido(id, res, 'del rol')) return;
  if (typeof id !== 'string') return;

  try {
    const rol = await inactivarRolServicio(id, req.usuario?.id ?? '');
    await registrarEvento(req, 'ROL_DESACTIVADO', { detalles: { rolId: String(rol._id), nombreRol: rol.nombreRol } });
    res.status(200).json({ mensaje: 'Rol desactivado', rol });
  } catch (error) {
    if (responderErrorRol(error, res)) return;
    console.error('[Roles] Error al desactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
