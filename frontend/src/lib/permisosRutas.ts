import { tienePermisos, type Permiso } from "@/lib/permisos";

/**
 * Tabla de prefijo de ruta a permiso (reemplaza a rutasCompartidas.ts del
 * Sprint 6 y al guard por prefijo del rol).
 *
 * Se arma recorriendo los enlaces del Sidebar. Gana el prefijo MÁS LARGO que
 * coincida: "/administrador" pide `roles`, pero "/administrador/bitacora"
 * pide `kpis`. Una ruta que no esté en la tabla no se autoriza (se niega por
 * omisión).
 *
 * Esto solo decide qué se muestra. La autorización real la hace el backend.
 */
export const PERMISO_POR_RUTA: Record<string, Permiso> = {
  "/administrador": "roles",
  "/administrador/parametros": "roles",
  "/administrador/gateways": "gateways",
  "/administrador/indicadores": "kpis",
  "/administrador/bitacora": "kpis",
  "/administrador/usuarios": "usuarios",
  "/admin/roles": "roles",
  "/usuarios/gestion": "usuarios",
  "/coordinador": "gateways",
  "/coordinador/proveedores": "proveedores",
  "/coordinador/pedidos": "pedidos",
  "/coordinador/indicadores": "kpis",
  "/coordinador/bitacora": "kpis",
  "/operador": "pedidos",
  "/operador/llegadas": "pedidos",
  "/cola": "cola",
};

function coincideConRuta(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/** Permiso que pide `pathname`, o null si la ruta no está en la tabla. */
export function permisoDeRuta(pathname: string): Permiso | null {
  let mejor: string | null = null;
  for (const ruta of Object.keys(PERMISO_POR_RUTA)) {
    if (coincideConRuta(pathname, ruta) && (mejor === null || ruta.length > mejor.length)) {
      mejor = ruta;
    }
  }
  return mejor === null ? null : PERMISO_POR_RUTA[mejor];
}

/** true si alguien con `permisos` puede entrar a `pathname`. */
export function puedeAcceder(permisos: readonly Permiso[], pathname: string): boolean {
  const requerido = permisoDeRuta(pathname);
  return requerido !== null && tienePermisos(permisos, [requerido]);
}
