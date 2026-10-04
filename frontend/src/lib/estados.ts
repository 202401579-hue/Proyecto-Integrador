export type EstadoPedido =
  | "PROGRAMADO"
  | "ANTICIPADO"
  | "A TIEMPO"
  | "TARDÍO"
  | "AUSENTE"
  | "CANCELADO"
  // Sprint 3: ciclo de descarga en el gateway.
  | "EN COLA"
  | "DESCARGANDO"
  | "FINALIZADO";

const CLASE_POR_ESTADO: Record<EstadoPedido, string> = {
  PROGRAMADO: "bg-secondary",
  ANTICIPADO: "bg-info",
  "A TIEMPO": "bg-success",
  TARDÍO: "bg-warning",
  AUSENTE: "bg-danger",
  CANCELADO: "bg-dark",
  "EN COLA": "bg-primary-subtle",
  DESCARGANDO: "bg-primary",
  FINALIZADO: "bg-light border",
};

const CLASE_DESCONOCIDA = "bg-secondary";

// bg-info y bg-warning son colores claros en Bootstrap: con texto blanco
// encima el contraste es malo, así que esos dos casos llevan texto oscuro.
// Lo mismo EN COLA (bg-primary-subtle) y FINALIZADO (bg-light), que tambien
// son claros.
const TEXTO_OSCURO: EstadoPedido[] = ["ANTICIPADO", "TARDÍO", "EN COLA", "FINALIZADO"];

// EN COLA usa ademas una clase de texto propia (text-primary-emphasis) en
// vez del text-dark genérico, para que combine con bg-primary-subtle.
const CLASE_TEXTO_ESPECIAL: Partial<Record<EstadoPedido, string>> = {
  "EN COLA": "text-primary-emphasis",
};

/**
 * Devuelve la clase de color de Bootstrap para un estado de pedido.
 *
 * Compara contra el texto exacto que manda el backend (ver sección 3 de
 * la guía): "TARDÍO" con tilde, "A TIEMPO" con espacio. Si el texto no
 * coincide exactamente, no hay match y se devuelve un color neutro en
 * vez de lanzar un error, para que un estado inesperado no rompa la
 * pantalla, solo se vea sin color reconocido.
 */
export function claseColorEstado(estado: string): string {
  return CLASE_POR_ESTADO[estado as EstadoPedido] ?? CLASE_DESCONOCIDA;
}

/** Clase de color de texto que combina bien con claseColorEstado(estado). */
export function claseTextoEstado(estado: string): string {
  const especial = CLASE_TEXTO_ESPECIAL[estado as EstadoPedido];
  if (especial) return especial;
  return TEXTO_OSCURO.includes(estado as EstadoPedido) ? "text-dark" : "text-white";
}

/**
 * Explica en palabras la diferencia en minutos que devuelve el backend.
 * Negativo: llegó antes de su ventana. Positivo: llegó después.
 */
export function explicarMinutosDeDiferencia(minutos: number): string {
  if (minutos < 0) {
    return `Llegó ${Math.abs(minutos)} minutos antes de su ventana`;
  }
  if (minutos > 0) {
    return `Llegó ${minutos} minutos después de su ventana`;
  }
  return "Llegó justo a tiempo";
}
