/**
 * Permisos del sistema (Sprint 7).
 *
 * Son los mismos ocho que valida el backend en models/Role.ts
 * (PERMISOS_VALIDOS). El frontend no importa el backend, así que si la lista
 * cambia allá hay que actualizarla acá a mano.
 *
 * IMPORTANTE: el frontend nunca es la seguridad. Estos permisos solo sirven
 * para ocultar lo que no corresponde; quien decide de verdad es el backend,
 * que reconsulta la base en cada petición (checkPermission) y responde 403.
 */
export const PERMISOS = [
  "usuarios",
  "roles",
  "proveedores",
  "pedidos",
  "gateways",
  "descargas",
  "cola",
  "kpis",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/** Etiqueta en español y frase corta de qué permite cada permiso. */
export const INFO_PERMISOS: Record<Permiso, { etiqueta: string; descripcion: string }> = {
  usuarios: {
    etiqueta: "Usuarios",
    descripcion: "Crear, editar y dar de baja cuentas, asignar roles y reiniciar el MFA.",
  },
  roles: {
    etiqueta: "Roles",
    descripcion: "Administrar el catálogo de roles y los parámetros globales del centro.",
  },
  proveedores: {
    etiqueta: "Proveedores",
    descripcion: "Consultar y mantener el catálogo de proveedores.",
  },
  pedidos: {
    etiqueta: "Pedidos",
    descripcion: "Gestionar pedidos y registrar llegadas en la caseta de arribos.",
  },
  gateways: {
    etiqueta: "Gateways",
    descripcion: "Ver el tablero de gateways y ponerlos en mantenimiento.",
  },
  descargas: {
    etiqueta: "Descargas",
    descripcion: "Iniciar y finalizar descargas en los gateways.",
  },
  cola: {
    etiqueta: "Cola de espera",
    descripcion: "Ver la cola de camiones con prioridad y reevaluarla.",
  },
  kpis: {
    etiqueta: "Indicadores",
    descripcion: "Ver el dashboard de indicadores y la bitácora de eventos.",
  },
};

export function esPermiso(valor: unknown): valor is Permiso {
  return typeof valor === "string" && (PERMISOS as readonly string[]).includes(valor);
}

/** true si la lista incluye TODOS los permisos pedidos. */
export function tienePermisos(tiene: readonly Permiso[], requeridos: readonly Permiso[]): boolean {
  return requeridos.every((p) => tiene.includes(p));
}

/**
 * Ruta a la que se manda al usuario justo después de iniciar sesión.
 *
 * El orden es el de la guía del Sprint 7: los tres roles base aterrizan
 * donde siempre (Administrador → /administrador, Coordinador →
 * /coordinador, Operador → /operador/llegadas) y un rol personalizado cae en
 * lo primero que sí puede ver. Sin ningún módulo, /sin-acceso.
 */
export function rutaInicial(permisos: readonly Permiso[]): string {
  const tiene = (p: Permiso) => permisos.includes(p);

  if (tiene("roles")) return "/administrador";
  if (tiene("proveedores")) return "/coordinador";
  if (tiene("pedidos")) return "/operador/llegadas";
  if (tiene("gateways")) return "/coordinador";
  if (tiene("cola")) return "/cola";
  if (tiene("kpis")) return "/administrador/indicadores";
  return "/sin-acceso";
}
