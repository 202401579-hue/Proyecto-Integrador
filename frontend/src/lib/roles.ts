import { obtenerToken } from "@/lib/session";
import { INFO_PERMISOS, PERMISOS, type Permiso } from "@/lib/permisos";

/**
 * Catálogo de roles (Sprint 7): tipos, permisos con su etiqueta en español y
 * las llamadas a /api/roles.
 */

const API = process.env.NEXT_PUBLIC_API_URL;

export { INFO_PERMISOS, PERMISOS };
export type { Permiso };

export interface RolSistema {
  _id: string;
  nombreRol: string;
  descripcion?: string;
  permisos: Permiso[];
  activo: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

/** Usuario que impide desactivar un rol (viene en el 409). */
export interface UsuarioConRol {
  _id: string;
  nombre: string;
  correo: string;
}

export type ResultadoRol<T> =
  | { ok: true; datos: T }
  | { ok: false; estado: number; mensaje: string; usuarios?: UsuarioConRol[] };

async function llamar<T>(
  ruta: string,
  metodo = "GET",
  cuerpo?: unknown
): Promise<ResultadoRol<T>> {
  try {
    const cabeceras: Record<string, string> = { Authorization: `Bearer ${obtenerToken()}` };
    if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";

    const respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      // Se conserva el mensaje del backend: los 400 y 409 explican la regla
      // que se chocó y reemplazarlos por un texto propio perdería eso.
      return {
        ok: false,
        estado: respuesta.status,
        mensaje: datos.mensaje ?? "No se pudo completar la operación.",
        usuarios: Array.isArray(datos.usuarios) ? datos.usuarios : undefined,
      };
    }
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, estado: 0, mensaje: "No se pudo conectar con el servidor" };
  }
}

/**
 * GET /api/roles. Sin el parámetro `activo` el backend devuelve SOLO los
 * activos, así que para "Mostrar inactivos" se piden las dos listas y se
 * unen acá.
 */
export async function listarRoles(incluirInactivos: boolean): Promise<ResultadoRol<RolSistema[]>> {
  const activos = await llamar<{ datos: RolSistema[] }>("/api/roles?activo=true");
  if (!activos.ok) return activos;
  if (!incluirInactivos) return { ok: true, datos: activos.datos.datos };

  const inactivos = await llamar<{ datos: RolSistema[] }>("/api/roles?activo=false");
  if (!inactivos.ok) return inactivos;

  const todos = [...activos.datos.datos, ...inactivos.datos.datos].sort((a, b) =>
    a.nombreRol.localeCompare(b.nombreRol, "es")
  );
  return { ok: true, datos: todos };
}

export interface DatosRol {
  nombreRol: string;
  descripcion: string;
  permisos: Permiso[];
}

export async function crearRol(datos: DatosRol): Promise<ResultadoRol<RolSistema>> {
  const r = await llamar<{ rol: RolSistema }>("/api/roles", "POST", datos);
  return r.ok ? { ok: true, datos: r.datos.rol } : r;
}

export async function actualizarRol(
  id: string,
  datos: Partial<DatosRol> & { activo?: true }
): Promise<ResultadoRol<RolSistema>> {
  const r = await llamar<{ rol: RolSistema }>(`/api/roles/${id}`, "PUT", datos);
  return r.ok ? { ok: true, datos: r.datos.rol } : r;
}

/** DELETE: baja lógica. Responde 409 con la lista de usuarios si el rol está en uso. */
export async function desactivarRol(id: string): Promise<ResultadoRol<RolSistema>> {
  const r = await llamar<{ mensaje: string; rol: RolSistema }>(`/api/roles/${id}`, "DELETE");
  return r.ok ? { ok: true, datos: r.datos.rol } : r;
}
