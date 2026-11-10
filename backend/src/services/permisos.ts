import { PERMISOS_VALIDOS, Permiso } from '../models/Role';

export const NOMBRE_ROL_ADMINISTRADOR = 'Administrador';

export class ErrorPermisos extends Error {}

export interface EstadoRolProtegido {
  nombreRol: string;
  permisos: readonly Permiso[];
  activo: boolean;
}

export interface CambiosRolProtegido {
  nombreRol?: unknown;
  permisos?: readonly Permiso[];
  activo?: boolean;
}

const normalizarNombreRol = (nombre: string): string => nombre.trim().toLocaleLowerCase('es');

export const esPermisoValido = (permiso: unknown): permiso is Permiso =>
  typeof permiso === 'string' && PERMISOS_VALIDOS.includes(permiso as Permiso);

/** Une permisos preservando el primer orden y eliminando duplicados. */
export const unirPermisos = (...listas: ReadonlyArray<readonly Permiso[]>): Permiso[] =>
  [...new Set(listas.flat())];

/** Valida la lista cerrada y devuelve una versión normalizada sin duplicados. */
export const validarListaPermisos = (permisos: unknown): Permiso[] => {
  if (!Array.isArray(permisos) || permisos.length === 0 || !permisos.every(esPermisoValido)) {
    throw new ErrorPermisos(`Debe indicar al menos un permiso válido: ${PERMISOS_VALIDOS.join(', ')}`);
  }

  return unirPermisos(permisos);
};

export const esRolAdministrador = (nombreRol: string): boolean =>
  normalizarNombreRol(nombreRol) === normalizarNombreRol(NOMBRE_ROL_ADMINISTRADOR);

/**
 * Las garantías del Administrador viven en una función pura para usarlas al
 * crear, actualizar y dar de baja, sin repetir reglas en los controladores.
 */
export const validarProteccionAdministrador = (
  actual: EstadoRolProtegido | undefined,
  cambios: CambiosRolProtegido
): void => {
  const esAdministradorActual = actual !== undefined && esRolAdministrador(actual.nombreRol);
  const nombreFinal =
    cambios.nombreRol === undefined
      ? actual?.nombreRol
      : typeof cambios.nombreRol === 'string'
        ? cambios.nombreRol
        : '';
  const seraAdministrador = nombreFinal !== undefined && esRolAdministrador(nombreFinal);

  if (!esAdministradorActual && !seraAdministrador) {
    return;
  }

  if (
    esAdministradorActual &&
    cambios.nombreRol !== undefined &&
    (typeof cambios.nombreRol !== 'string' || cambios.nombreRol.trim() !== actual.nombreRol)
  ) {
    throw new ErrorPermisos('El rol Administrador no se puede renombrar');
  }

  if (cambios.activo === false) {
    throw new ErrorPermisos('El rol Administrador no se puede desactivar');
  }

  const permisosFinales = cambios.permisos ?? actual?.permisos;
  if (
    !permisosFinales ||
    !permisosFinales.includes('usuarios') ||
    !permisosFinales.includes('roles')
  ) {
    throw new ErrorPermisos('El rol Administrador debe conservar los permisos usuarios y roles');
  }
};
