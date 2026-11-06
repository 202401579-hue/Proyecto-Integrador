import { obtenerRutaPorRol, type Rol } from "@/lib/session";

/**
 * Rutas que no pertenecen al prefijo de ningún rol (por ejemplo /cola, que
 * usan los tres roles por igual), con la lista de roles que pueden entrar
 * a cada una.
 *
 * En el Sprint 7 este mapa pasa a ser de ruta a permiso (checkPermission),
 * en vez de una lista fija de roles: por ahora alcanza con esto porque solo
 * hay tres roles y no hace falta nada más granular.
 */
export const RUTAS_COMPARTIDAS: Record<string, Rol[]> = {
  "/cola": ["Administrador", "Coordinador", "Operador"],
};

function coincideConRuta(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/**
 * true si `rol` puede entrar a `pathname`: porque cae dentro del prefijo de
 * su propia sección (el de obtenerRutaPorRol), o porque pathname es una de
 * las RUTAS_COMPARTIDAS y ese rol está en su lista.
 */
export function puedeAcceder(rol: Rol, pathname: string): boolean {
  const rutaDelRol = obtenerRutaPorRol(rol);
  if (coincideConRuta(pathname, rutaDelRol)) {
    return true;
  }

  const compartida = Object.entries(RUTAS_COMPARTIDAS).find(([ruta]) =>
    coincideConRuta(pathname, ruta)
  );
  return compartida ? compartida[1].includes(rol) : false;
}
