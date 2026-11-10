import { obtenerToken } from "@/lib/session";

// Forma exacta de GET /api/cola y POST /api/cola/reevaluar (Sprint 6).
// El orden y la prioridad los calcula el backend; el frontend solo los pide
// y los dibuja, nunca reordena items del lado del cliente.

const API = process.env.NEXT_PUBLIC_API_URL;

export interface ItemCola {
  posicion: number;
  pedidoId: string;
  numeroPedido: string;
  proveedor: { id: string; nombre: string } | null;
  tipoProducto: string;
  puntualidad: string;
  prioridadBase: number;
  prioridadCalculada: number;
  minutosEnEspera: number;
  fechaHoraProgramada: string;
  fechaHoraIngresoCola?: string;
  excedeLimite: boolean;
}

export interface ColaOrdenada {
  factorAgingMin: number;
  limiteEsperaMax: number;
  generadoEn: string;
  items: ItemCola[];
}

export interface ResultadoReevaluar extends ColaOrdenada {
  pedidosQueSubieronDePrioridad: number;
}

export interface RespuestaCola<T> {
  ok: boolean;
  datos: T | null;
  mensaje: string | null;
}

async function llamar<T>(ruta: string, metodo: "GET" | "POST"): Promise<RespuestaCola<T>> {
  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${obtenerToken()}` },
    });

    const cuerpo: unknown = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      const mensaje = (cuerpo as { mensaje?: string } | null)?.mensaje;
      return { ok: false, datos: null, mensaje: mensaje ?? "No se pudo completar la operación" };
    }

    return { ok: true, datos: cuerpo as T, mensaje: null };
  } catch {
    return { ok: false, datos: null, mensaje: "No se pudo conectar con el servidor" };
  }
}

/** GET /api/cola: solo lectura, no escribe nada en el servidor. */
export function obtenerCola(): Promise<RespuestaCola<ColaOrdenada>> {
  return llamar<ColaOrdenada>("/api/cola", "GET");
}

/** POST /api/cola/reevaluar: recalcula y guarda la prioridad de toda la cola. */
export function reevaluarCola(): Promise<RespuestaCola<ResultadoReevaluar>> {
  return llamar<ResultadoReevaluar>("/api/cola/reevaluar", "POST");
}
