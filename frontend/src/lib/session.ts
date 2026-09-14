export type Rol = "Administrador" | "Coordinador" | "Operador";

export interface TokenPayload {
  id: string;
  correo: string;
  rol: Rol;
  iat: number;
  exp: number;
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

export function eliminarToken(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

export function decodificarToken(token: string): TokenPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export function estaExpirado(payload: TokenPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

export function sesionDesdeToken(token: string | null): TokenPayload | null {
  if (!token) return null;

  const payload = decodificarToken(token);
  if (!payload || estaExpirado(payload)) return null;

  return payload;
}

export function obtenerSesion(): TokenPayload | null {
  return sesionDesdeToken(obtenerToken());
}

export function obtenerRutaPorRol(rol: Rol): string {
  return RUTA_POR_ROL[rol] ?? "/login";
}
