export type EstadoGateway = "LIBRE" | "OCUPADO" | "FUERA DE SERVICIO";

export interface Gateway {
  _id: string;
  numeroGateway: number;
  tipoCargaPermitida: string;
  estado: EstadoGateway;
  // Auditoría: con esto se muestra desde cuándo una bahía está en mantenimiento.
  fechaActualizacion?: string;
  usuarioActualizacion?: string;
}

// Forma de cada descarga en GET /api/descargas/activas: el gateway y el
// pedido vienen poblados, y el pedido trae adentro a su proveedor.
export interface Descarga {
  _id: string;
  gatewayId: { _id: string; numeroGateway: number; tipoCargaPermitida: string };
  pedidoId: {
    _id: string;
    numeroPedido: string;
    tipoProducto: string;
    proveedorId?: { razonSocial: string };
  };
  fechaHoraInicio: string;
  fechaHoraFin: string | null;
  duracionMinutos: number | null;
}

// Paleta del tablero. Verde, rojo y gris como pide el enunciado, en tonos
// del mismo peso para que combinen con el azul marino del sidebar. Los tres
// llevan texto blanco encima con contraste suficiente (4.5:1 o más).
export const COLOR_POR_ESTADO: Record<EstadoGateway, string> = {
  LIBRE: "#2b7a50",
  OCUPADO: "#c8463d",
  "FUERA DE SERVICIO": "#6b7686",
};

const COLOR_DESCONOCIDO = "#6b7686";

/**
 * Devuelve el color de un gateway según su estado.
 *
 * El texto se compara tal cual lo manda el backend ("FUERA DE SERVICIO" con
 * espacios y en mayúsculas). Si llega algo que no se reconoce, se pinta gris
 * en vez de romper la pantalla.
 */
export function colorGateway(estado: string): string {
  return COLOR_POR_ESTADO[estado as EstadoGateway] ?? COLOR_DESCONOCIDO;
}

/**
 * Fondo completo de la puerta del andén: color liso, salvo FUERA DE SERVICIO,
 * que lleva rayas diagonales para distinguirse aunque no se perciba el color.
 */
export function fondoGateway(estado: string): string {
  if (estado === "FUERA DE SERVICIO") {
    return "repeating-linear-gradient(45deg, #6b7686 0 14px, #5d6776 14px 28px)";
  }
  return colorGateway(estado);
}
