import { decodificarToken } from "@/lib/session";

/**
 * Piezas compartidas del segundo factor (Sprint 5).
 *
 * El backend vuelve a validar todo lo que hay acá. Esta validación del lado
 * del navegador existe para no gastar un viaje al servidor por un error de
 * tipeo y para poder avisar en el acto.
 */

const API = process.env.NEXT_PUBLIC_API_URL;

/** Código del autenticador: seis dígitos exactos. */
const FORMATO_TOTP = /^\d{6}$/;

/**
 * Código de recuperación: dos grupos de cinco. El alfabeto es el mismo que
 * usa el backend al generarlos, sin 0/O ni 1/I/L, que son los que se leen mal
 * cuando el usuario los transcribe de un papel.
 */
const FORMATO_RECUPERACION = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/;

/** Las tres respuestas posibles de POST /api/auth/login. */
export interface RespuestaDeLogin {
  token?: string;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  tempToken?: string;
  mensaje?: string;
}

export interface RespuestaSetup {
  mensaje: string;
  otpauthUrl: string;
  secretoBase32: string;
}

export interface RespuestaActivacion {
  mensaje: string;
  codigosDeRecuperacion: string[];
  siguientePaso: string;
}

export interface RespuestaVerificacion {
  token: string;
  avisoRecuperacion?: string;
}

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/** Solo un código del autenticador. Es lo único que sirve para activar. */
export function esCodigoTotp(codigo: string): boolean {
  return FORMATO_TOTP.test(codigo.trim());
}

/** Código del autenticador o de recuperación: los dos entran al verificar. */
export function esCodigoAceptable(codigo: string): boolean {
  const limpio = normalizarCodigo(codigo);
  return FORMATO_TOTP.test(limpio) || FORMATO_RECUPERACION.test(limpio);
}

/**
 * Segundos que le quedan al token temporal.
 *
 * Se lee el `exp` del propio JWT en lugar de contar cinco minutos a mano:
 * así el reloj del navegador no se puede ir separando del plazo real que
 * firmó el servidor.
 *
 * decodificarToken está pensado para el token de acceso, pero el temporal es
 * el mismo JWT con otros campos adentro, y lo único que se usa acá es `exp`,
 * que los dos llevan.
 */
export function segundosHastaExpirar(token: string): number {
  const payload = decodificarToken(token);
  if (!payload?.exp) return 0;

  return Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
}

/** Formato mm:ss para el contador en pantalla. */
export function comoRelojito(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

/**
 * Resultado de una llamada hecha con el token temporal.
 *
 * Los cuatro casos existen porque cada uno lleva a una pantalla distinta:
 * `rechazado` deja al usuario donde está para que vuelva a probar, `caida`
 * lo manda de nuevo al login porque ya no hay con qué seguir, y `falla` es
 * un problema de red que sí conviene reintentar.
 */
export type Resultado<T> =
  | { estado: "ok"; datos: T }
  | { estado: "rechazado"; mensaje: string; intentosRestantes?: number }
  | { estado: "caida"; mensaje: string }
  | { estado: "falla"; mensaje: string };

const MENSAJE_GENERICO = "Ocurrió un problema al verificar el código.";

/**
 * Llama a una ruta protegida por el token temporal y traduce la respuesta a
 * uno de los cuatro casos de arriba.
 *
 * El 401 es el que necesita criterio: el backend lo usa tanto para "ese
 * código no es" como para "este token temporal ya no vale". Se distinguen por
 * `intentosRestantes`, que solo viaja en el primero. Importa acertar: tratar
 * un código errado como sesión caída obligaría a poner la contraseña de nuevo
 * por una tecla mal apretada, y tratar una sesión caída como código errado
 * dejaría al usuario probando contra un token que ya no existe.
 */
export async function llamarConTokenTemporal<T>(
  ruta: string,
  tempToken: string,
  cuerpo?: unknown
): Promise<Resultado<T>> {
  try {
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${tempToken}`,
    };
    if (cuerpo !== undefined) {
      cabeceras["Content-Type"] = "application/json";
    }

    const respuesta = await fetch(`${API}${ruta}`, {
      method: "POST",
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) {
      return { estado: "ok", datos: datos as T };
    }

    const mensaje: string = datos.mensaje ?? MENSAJE_GENERICO;

    // Se agotaron los cinco intentos de este token, o la cuenta quedó
    // inactiva mientras el usuario estaba en el segundo paso.
    if (respuesta.status === 429 || respuesta.status === 403) {
      return { estado: "caida", mensaje };
    }

    if (respuesta.status === 401) {
      return typeof datos.intentosRestantes === "number"
        ? { estado: "rechazado", mensaje, intentosRestantes: datos.intentosRestantes }
        : { estado: "caida", mensaje };
    }

    // 400: formato del código, MFA ya activado, o sin secreto previo. Un
    // código mal formado no gasta ninguno de los cinco intentos.
    if (respuesta.status === 400) {
      return { estado: "rechazado", mensaje };
    }

    return { estado: "falla", mensaje };
  } catch {
    return { estado: "falla", mensaje: "No se pudo conectar con el servidor" };
  }
}
