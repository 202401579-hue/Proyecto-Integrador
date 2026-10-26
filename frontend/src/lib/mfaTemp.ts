/**
 * Token temporal del segundo factor (Sprint 5).
 *
 * El login en dos pasos devuelve un token MFA_TEMP de cinco minutos que no
 * es una sesión: solo sirve para completar el segundo paso en /api/mfa/* y en
 * /api/auth/mfa/verify-login. Acá están las tres operaciones que hacen falta
 * sobre él, en un solo lugar.
 *
 * Va en sessionStorage y NUNCA en localStorage['token'], que es la clave de
 * la sesión de verdad. Son dos razones distintas:
 *
 *  - Guardarlo en la clave de la sesión dejaría a toda la aplicación creyendo
 *    que hay sesión cuando todavía no hay ninguna. El layout privado miraría
 *    ese token, lo encontraría vigente y renderizaría la zona privada, y
 *    todas las llamadas a la API responderían 403 sin que nadie entienda por
 *    qué. Por eso lib/session.ts, además, solo acepta tokens con
 *    type 'ACCESS'.
 *
 *  - sessionStorage muere al cerrar la pestaña y no se comparte entre
 *    pestañas, que es lo que corresponde a una credencial a medias de cinco
 *    minutos. Se elige sobre tenerlo solo en memoria porque el paso del
 *    código vive en su propia ruta (/login/mfa) y, al navegar, React
 *    desmonta la pantalla anterior: sin almacenamiento, recargar o llegar a
 *    esa ruta dejaría al usuario sin con qué verificar.
 *
 * Igual no se confía en el plazo que diga el navegador: el token lleva su
 * propio exp firmado, y el backend lo rechaza vencido.
 */

const CLAVE_TEMPORAL = "mfaTempToken";

export function guardarTokenTemporal(token: string): void {
  sessionStorage.setItem(CLAVE_TEMPORAL, token);
}

/** null si no hay, o si se está ejecutando en el servidor. */
export function obtenerTokenTemporal(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CLAVE_TEMPORAL);
}

export function borrarTokenTemporal(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CLAVE_TEMPORAL);
}
