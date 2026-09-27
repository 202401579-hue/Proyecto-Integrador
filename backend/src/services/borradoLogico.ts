import { Request } from 'express';
import { QueryFilter } from 'mongoose';

/**
 * Borrado logico: en este proyecto esta prohibido borrar documentos de la
 * base. Un DELETE pasa `activo` a false y las consultas los dejan afuera.
 *
 * Aca viven las dos piezas que comparten los tres modulos: el filtro que
 * usan los listados y la marca de baja que usan los DELETE.
 */

/**
 * Nombre del parametro de consulta que permite ver tambien los inactivos.
 * Es la excepcion, no la regla: sirve para pantallas de auditoria o para
 * revisar que un registro dado de baja siga estando.
 */
export const PARAMETRO_INCLUIR_INACTIVOS = 'incluirInactivos';

/**
 * Filtro para los listados. Por defecto devuelve solo los activos; con
 * `?incluirInactivos=true` en la URL no filtra nada.
 *
 * Es el default lo importante: si el filtro fuera opt-in, alcanzaria con
 * olvidarlo en un listado para que los registros dados de baja reaparezcan.
 */
export const filtroActivos = <T>(req: Request): QueryFilter<T> => {
  const incluir = req.query[PARAMETRO_INCLUIR_INACTIVOS];

  // Solo el texto exacto "true" desactiva el filtro. Cualquier otra cosa
  // ("false", "1", vacio) se trata como "no, mostrame solo los activos".
  return incluir === 'true' ? {} : ({ activo: true } as QueryFilter<T>);
};
