import { borrarTokenTemporal } from "@/lib/mfaTemp";

export type Rol = "Administrador" | "Coordinador" | "Operador";

/**
 * Único tipo de token que abre sesión. El backend firma dos con el mismo
 * secreto y los distingue por este campo: el de acceso, de ocho horas, y el
 * MFA_TEMP de cinco minutos que solo sirve para completar el segundo factor.
 */
export const TIPO_TOKEN_ACCESO = "ACCESS";

/** Un token de acceso ya validado. */
export interface TokenPayload {
  id: string;
  correo: string;
  rol: Rol;
  type: typeof TIPO_TOKEN_ACCESO;
  iat: number;
  exp: number;
}

/**
 * Lo que sale de decodificar cualquier JWT, antes de saber qué es. Puede ser
 * un token de acceso, un MFA_TEMP (que no lleva rol) o uno emitido antes del
 * Sprint 5 (que no lleva type).
 */
interface PayloadCrudo {
  id?: unknown;
  correo?: unknown;
  rol?: unknown;
  type?: unknown;
  iat?: unknown;
  exp?: unknown;
}

const CLAVE_TOKEN = "token";

const RUTA_POR_ROL: Record<Rol, string> = {
  Administrador: "/administrador",
  Coordinador: "/coordinador",
  Operador: "/operador",
};

export function obtenerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CLAVE_TOKEN);
}

/**
 * Guarda el token de acceso. Existe para que la clave "token" se escriba en
 * un solo lugar: desde el Sprint 5 el login no es el único que abre sesión,
 * también lo hace la verificación del segundo factor.
 */
export function guardarToken(token: string): void {
  localStorage.setItem(CLAVE_TOKEN, token);
}

export function eliminarToken(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

/**
 * Cierra la sesión: borra el token de acceso Y el temporal del segundo
 * factor.
 *
 * Los dos juntos, porque son dos credenciales distintas y dejar una a medio
 * camino es peor que no cerrar nada: si alguien queda con un token temporal
 * vivo y vuelve a entrar, su siguiente paso del MFA se haría contra un token
 * de otra sesión.
 */
export function cerrarSesion(): void {
  eliminarToken();
  borrarTokenTemporal();
}

export function decodificarToken(token: string): PayloadCrudo | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as PayloadCrudo;
  } catch {
    return null;
  }
}

export function estaExpirado(payload: { exp: number }): boolean {
  return Date.now() >= payload.exp * 1000;
}

/** true si el valor es uno de los tres roles que conoce el sistema. */
function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && valor in RUTA_POR_ROL;
}

/**
 * Convierte un token en sesión, o devuelve null.
 *
 * SOLO acepta tokens de acceso. Un MFA_TEMP y uno viejo sin `type` cuentan
 * como "no hay sesión", y el criterio es negar por omisión: si no dice
 * ACCESS, no entra.
 *
 * Importa porque es lo único que mira el layout privado. Sin esta
 * comprobación, un token temporal puesto en localStorage["token"] pasaba por
 * sesión válida: el layout renderizaba la zona privada y después cada llamada
 * a la API respondía 403 sin que nadie entendiera por qué. Y un token del
 * Sprint 0 sin `type` entraba igual, cuando el backend ya lo rechaza. El
 * costo de negar por omisión es un único reinicio de sesión para quien tenga
 * uno viejo guardado.
 *
 * Se exige además que el rol sea uno de los tres conocidos: de ahí sale la
 * ruta de la sección, y un rol que no esté en el mapa dejaría al usuario
 * dando vueltas entre redirecciones.
 */
export function sesionDesdeToken(token: string | null): TokenPayload | null {
  if (!token) return null;

  const payload = decodificarToken(token);
  if (!payload) return null;

  if (payload.type !== TIPO_TOKEN_ACCESO) return null;
  if (!esRol(payload.rol)) return null;
  if (typeof payload.exp !== "number" || estaExpirado({ exp: payload.exp })) return null;

  // Se arma el objeto en lugar de forzar el tipo: así lo que devuelve esta
  // función es lo que de verdad se comprobó.
  return {
    id: String(payload.id ?? ""),
    correo: String(payload.correo ?? ""),
    rol: payload.rol,
    type: TIPO_TOKEN_ACCESO,
    iat: typeof payload.iat === "number" ? payload.iat : 0,
    exp: payload.exp,
  };
}

export function obtenerSesion(): TokenPayload | null {
  return sesionDesdeToken(obtenerToken());
}

export function obtenerRutaPorRol(rol: Rol): string {
  return RUTA_POR_ROL[rol] ?? "/login";
}
