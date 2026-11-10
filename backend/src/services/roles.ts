import { Types } from 'mongoose';
import Role, { COLLATION_NOMBRE_ROL, IRole, Permiso } from '../models/Role';
import Usuario from '../models/Usuario';
import {
  ErrorPermisos,
  EstadoRolProtegido,
  unirPermisos,
  validarListaPermisos,
  validarProteccionAdministrador
} from './permisos';

export class ErrorRolNoEncontrado extends Error {}

export class ErrorNombreRolDuplicado extends Error {}

export class ErrorRolAsignado extends Error {
  constructor(public readonly usuarios: Array<{ _id: Types.ObjectId; nombre: string; correo: string }>) {
    super('No se puede desactivar un rol que tiene usuarios activos asignados');
  }
}

/** Error de entrada para la asignacion de roles de un usuario. */
export class ErrorRolesUsuario extends Error {}

export interface DatosRol {
  nombreRol?: unknown;
  descripcion?: unknown;
  permisos?: unknown;
  activo?: unknown;
}

const aEstadoProtegido = (rol: IRole): EstadoRolProtegido => ({
  nombreRol: rol.nombreRol,
  permisos: rol.permisos,
  activo: rol.activo
});

const usuarioIdValido = (usuarioId: string): Types.ObjectId | undefined =>
  Types.ObjectId.isValid(usuarioId) ? new Types.ObjectId(usuarioId) : undefined;

const idsDeRoles = (roles: unknown): string[] => {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new ErrorRolesUsuario('Debe asignarse al menos un rol activo');
  }

  if (!roles.every((rol) => typeof rol === 'string' && Types.ObjectId.isValid(rol))) {
    throw new ErrorRolesUsuario('Cada rol debe ser un identificador válido');
  }

  const ids = roles as string[];
  if (new Set(ids).size !== ids.length) {
    throw new ErrorRolesUsuario('No se puede asignar el mismo rol más de una vez');
  }

  return ids;
};

/** Valida la entrada de POST/PUT usuarios y devuelve solo roles activos. */
export const validarRolesActivos = async (roles: unknown): Promise<IRole[]> => {
  const ids = idsDeRoles(roles);
  const encontrados = await Role.find({ _id: { $in: ids }, activo: true }).sort({ nombreRol: 1 });

  if (encontrados.length !== ids.length) {
    throw new ErrorRolesUsuario('Todos los roles deben existir y estar activos');
  }

  return encontrados;
};

/** Roles activos y permisos efectivos para emitir el claim informativo del JWT. */
export const datosDeAccesoDeRoles = async (
  roles: readonly (Types.ObjectId | string)[] | undefined
): Promise<{ roles: string[]; permisos: Permiso[] }> => {
  const ids = Array.isArray(roles)
    ? roles.map((rol) => String(rol)).filter((rol) => Types.ObjectId.isValid(rol))
    : [];

  if (ids.length === 0) return { roles: [], permisos: [] };

  const encontrados = await Role.find({ _id: { $in: ids }, activo: true })
    .select('nombreRol permisos')
    .lean();

  return {
    roles: encontrados.map((rol) => rol.nombreRol),
    permisos: unirPermisos(...encontrados.map((rol) => rol.permisos))
  };
};

const existeNombreActivo = async (nombreRol: string, excluirId?: Types.ObjectId): Promise<boolean> => {
  const filtro = {
    nombreRol,
    activo: true,
    ...(excluirId ? { _id: { $ne: excluirId } } : {})
  };
  const rol = await Role.findOne(filtro).collation(COLLATION_NOMBRE_ROL).select('_id').lean();
  return rol !== null;
};

const asignarCamposEditables = (rol: IRole, datos: DatosRol): void => {
  if (datos.nombreRol !== undefined) rol.nombreRol = datos.nombreRol as string;
  if (datos.descripcion !== undefined) rol.descripcion = datos.descripcion as string;
  if (datos.permisos !== undefined) rol.permisos = unirPermisos(validarListaPermisos(datos.permisos));
  if (datos.activo !== undefined) rol.activo = datos.activo as boolean;
};

export const listarRoles = async (activo: boolean): Promise<IRole[]> =>
  Role.find({ activo }).sort({ nombreRol: 1 }).collation(COLLATION_NOMBRE_ROL);

export const crearRol = async (datos: DatosRol, usuarioId: string): Promise<IRole> => {
  const nombreRol = typeof datos.nombreRol === 'string' ? datos.nombreRol.trim() : '';
  const permisos = validarListaPermisos(datos.permisos);

  validarProteccionAdministrador(undefined, { nombreRol, permisos, activo: true });

  if (await existeNombreActivo(nombreRol)) {
    throw new ErrorNombreRolDuplicado('Ya existe un rol activo con ese nombre');
  }

  return Role.create({
    nombreRol,
    descripcion: datos.descripcion as string | undefined,
    permisos,
    usuarioCreacion: usuarioIdValido(usuarioId)
  });
};

export const actualizarRol = async (
  id: string,
  datos: DatosRol,
  usuarioId: string
): Promise<IRole> => {
  const rol = await Role.findById(id);
  if (!rol) throw new ErrorRolNoEncontrado('El rol indicado no existe');

  if (datos.activo !== undefined && typeof datos.activo !== 'boolean') {
    throw new ErrorPermisos('El campo activo debe ser booleano');
  }

  if (datos.activo === false) {
    throw new ErrorPermisos('Use DELETE para desactivar un rol');
  }

  const permisos = datos.permisos === undefined ? rol.permisos : validarListaPermisos(datos.permisos);
  const nombreRol = datos.nombreRol === undefined ? rol.nombreRol : String(datos.nombreRol).trim();
  const activo = datos.activo === undefined ? rol.activo : datos.activo === true;

  validarProteccionAdministrador(aEstadoProtegido(rol), { nombreRol, permisos, activo });

  if (activo && (await existeNombreActivo(nombreRol, rol._id))) {
    throw new ErrorNombreRolDuplicado('Ya existe un rol activo con ese nombre');
  }

  asignarCamposEditables(rol, { ...datos, nombreRol, permisos, activo });
  rol.usuarioActualizacion = usuarioIdValido(usuarioId);
  await rol.save();
  return rol;
};

/** Devuelve hasta cinco usuarios activos que tienen el rol asignado. */
const usuariosActivosConRol = async (
  rol: IRole
): Promise<Array<{ _id: Types.ObjectId; nombre: string; correo: string }>> =>
  Usuario.find({ activo: { $ne: false }, roles: rol._id }).select('nombre correo').limit(5).lean();

export const inactivarRol = async (id: string, usuarioId: string): Promise<IRole> => {
  const rol = await Role.findOne({ _id: id, activo: true });
  if (!rol) throw new ErrorRolNoEncontrado('El rol indicado no existe o ya está inactivo');

  validarProteccionAdministrador(aEstadoProtegido(rol), { activo: false });

  const usuarios = await usuariosActivosConRol(rol);
  if (usuarios.length > 0) throw new ErrorRolAsignado(usuarios);

  rol.activo = false;
  rol.usuarioActualizacion = usuarioIdValido(usuarioId);
  await rol.save();
  return rol;
};
