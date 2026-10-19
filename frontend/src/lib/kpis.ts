// Forma exacta de GET /api/kpis (sección 3.1 de la guía del Sprint 4).
// Los indicadores los calcula el backend; el dashboard solo los dibuja.

export type Puntualidad = "A TIEMPO" | "ANTICIPADO" | "TARDÍO" | "AUSENTE";

export interface Kpis {
  periodo: { desde: string; hasta: string; zonaHoraria: string };
  tiempoEspera: { promedioMinutos: number | null; cantidad: number };
  tiempoDescarga: { tipoCarga: string; promedioMinutos: number | null; cantidad: number }[];
  cumplimiento: {
    total: number;
    distribucion: { puntualidad: Puntualidad; cantidad: number; porcentaje: number }[];
  };
  ocupacionPorMuelle: {
    numeroGateway: number;
    tipoCargaPermitida: string;
    minutosOcupado: number;
    minutosOperativos: number;
    porcentaje: number;
  }[];
  volumenDiario: { fecha: string; finalizados: number }[];
}

// Colores de la sección 4 de la guía: los mismos de Bootstrap que usan las
// etiquetas de la caseta y de la tabla de pedidos, para que todo el sistema
// hable el mismo idioma. Los textos se comparan tal cual: "TARDÍO" con
// tilde, "A TIEMPO" con espacio, "construcción" con tilde.
export const COLOR_PUNTUALIDAD: Record<Puntualidad, string> = {
  "A TIEMPO": "#198754",
  ANTICIPADO: "#0dcaf0",
  TARDÍO: "#ffc107",
  AUSENTE: "#dc3545",
};

export const COLOR_CARGA: Record<string, string> = {
  general: "#0d6efd",
  construcción: "#6c757d",
};

export function colorCarga(tipo: string): string {
  return COLOR_CARGA[tipo] ?? "#6c757d";
}

/** "construcción" -> "Construcción" */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-05" -> "lun 05/10". Se arma a mediodía UTC para que ninguna zona horaria cambie el día. */
export function etiquetaDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = d.toLocaleDateString("es-SV", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const ddmm = d.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `${dia} ${ddmm}`;
}

/** "2026-10-05" -> "05/10/2026" */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

/** 23.4 -> "23.4", 41 -> "41" */
export function minutos(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
}

/** Minutos a texto corto: 1240 -> "20 h 40 min" */
export function duracionLarga(totalMinutos: number): string {
  const h = Math.floor(totalMinutos / 60);
  const m = Math.round(totalMinutos % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
