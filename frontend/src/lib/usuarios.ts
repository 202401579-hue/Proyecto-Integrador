import { obtenerToken, type Rol } from "@/lib/session";

/**
 * Administración de usuarios (Sprint 5).
 *
 * Acá viven la forma del usuario tal como la devuelve el backend y la
 * llamada autenticada que comparten la tabla y el formulario.
 */

const API = process.env.NEXT_PUBLIC_API_URL;

export const ROLES: Rol[] = ["Administrador", "Coordinador", "Operador"];

/**
 * Lo que devuelve GET /api/usuarios.
 *
 * No hay password, ni twoFactorSecret, ni los códigos de recuperación: los
 * tres campos tienen select: false en el modelo y, además, el backend los
 * borra al serializar. Nunca llegan al navegador, así que no se declaran.
 */
export interface Usuario {
  _id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  /** Un administrador le exige la verificación en dos pasos. */
  mfaObligatorio: boolean;
  /** Ya la configuró y la tiene andando. */
  twoFactorEnabled: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  usuarioCreacion?: string;
  usuarioActualizacion?: string;
}

/**
 * Resultado de una llamada a la API.
 *
 * Se devuelve el mensaje del backend en lugar de uno propio: los 409 de este
 * módulo ("ya existe un usuario con ese correo", "no puede quitarse a sí
 * mismo el rol de Administrador") explican la regla que se chocó, y
 * reemplazarlos por un "hubo un error" sería perder justo esa explicación.
 */
export type ResultadoApi<T> =
  | { ok: true; datos: T }
  | { ok: false; mensaje: string };

export async function llamarApi<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown } = {}
): Promise<ResultadoApi<T>> {
  try {
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${obtenerToken()}`,
    };
    if (opciones.cuerpo !== undefined) {
      cabeceras["Content-Type"] = "application/json";
    }

    const respuesta = await fetch(`${API}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      return {
        ok: false,
        mensaje: datos.mensaje ?? "No se pudo completar la operación.",
      };
    }

    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, mensaje: "No se pudo conectar con el servidor" };
  }
}

/**
 * GET /api/usuarios. Por defecto solo los activos; el listado viene ordenado
 * por nombre desde el backend, así que no se reordena acá.
 */
export function listarUsuarios(incluirInactivos: boolean): Promise<ResultadoApi<Usuario[]>> {
  const consulta = incluirInactivos ? "?incluirInactivos=true" : "";
  return llamarApi<Usuario[]>(`/api/usuarios${consulta}`);
}
