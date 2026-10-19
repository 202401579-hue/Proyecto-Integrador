"use client";

import { useEffect, useMemo, useState } from "react";
import { obtenerToken } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Las seis acciones de la bitácora (sección 2.3 de la guía de Sprint 4).
 * Se repiten aquí porque el frontend no importa el backend: si algún día
 * cambia la lista en models/Evento.ts, hay que actualizar este arreglo a
 * mano (el <select> de abajo es la única cosa que depende de él).
 */
const ACCIONES_EVENTO = [
  "LLEGADA_REGISTRADA",
  "GATEWAY_ASIGNADO",
  "DESCARGA_INICIADA",
  "DESCARGA_FINALIZADA",
  "CITA_REPROGRAMADA",
  "GATEWAY_MANTENIMIENTO",
] as const;

type AccionEvento = (typeof ACCIONES_EVENTO)[number];

type Usuario = {
  _id: string;
  nombre: string;
  rol: string;
};

type PedidoResumido = {
  _id: string;
  numeroPedido: string;
};

type Evento = {
  _id: string;
  usuarioId: Usuario | null;
  pedidoId: PedidoResumido | null;
  accion: AccionEvento;
  detalles: Record<string, unknown>;
  fechaHora: string;
  usuarioCreacion?: string;
};

type EstadoCarga = "cargando" | "lista" | "error";

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** true cuando el evento lo disparó la promoción automática de la cola, no una persona. */
function esAutomatico(evento: Evento): boolean {
  return evento.detalles?.automatica === true;
}

/**
 * Resumen en una línea de los detalles de un evento. Cada acción guarda
 * datos distintos (ver sección 2.3 de la guía), así que hay un caso por
 * acción; el resto de las claves de `detalles` no se muestran acá, pero
 * siguen disponibles si algún día se agrega un detalle expandible.
 */
function resumirDetalles(evento: Evento): string {
  const d = evento.detalles ?? {};

  switch (evento.accion) {
    case "LLEGADA_REGISTRADA": {
      const puntualidad = String(d.puntualidad ?? "—");
      const diferencia = typeof d.minutosDeDiferencia === "number" ? d.minutosDeDiferencia : null;
      if (diferencia === null) return `Puntualidad: ${puntualidad}`;
      const texto = diferencia < 0 ? `${Math.abs(diferencia)} min antes` : diferencia > 0 ? `${diferencia} min después` : "justo a tiempo";
      return `Puntualidad: ${puntualidad} (${texto} de la ventana)`;
    }
    case "GATEWAY_ASIGNADO":
      return `Gateway ${String(d.numeroGateway ?? "—")} asignado (carga ${String(d.tipoCarga ?? "—")})`;
    case "DESCARGA_INICIADA":
      return `Descarga iniciada en el gateway ${String(d.numeroGateway ?? "—")}`;
    case "DESCARGA_FINALIZADA": {
      const duracion = typeof d.duracionMinutos === "number" ? `${d.duracionMinutos} min` : "—";
      return `Descarga finalizada en el gateway ${String(d.numeroGateway ?? "—")} (${duracion})`;
    }
    case "CITA_REPROGRAMADA":
      return "La cita del pedido cambió de horario";
    case "GATEWAY_MANTENIMIENTO":
      return `Gateway ${String(d.numeroGateway ?? "—")}: cambio de estado de mantenimiento`;
    default:
      return "—";
  }
}

const ETIQUETA_ACCION: Record<AccionEvento, string> = {
  LLEGADA_REGISTRADA: "Llegada registrada",
  GATEWAY_ASIGNADO: "Gateway asignado",
  DESCARGA_INICIADA: "Descarga iniciada",
  DESCARGA_FINALIZADA: "Descarga finalizada",
  CITA_REPROGRAMADA: "Cita reprogramada",
  GATEWAY_MANTENIMIENTO: "Gateway en mantenimiento",
};

/**
 * Tabla de la bitácora de eventos (RN-14, Sprint 4 Prioridad 3). Es de
 * solo lectura: no hay ningún botón que escriba nada, porque la API no
 * tiene ninguna ruta para eso.
 *
 * El mismo componente se usa en /coordinador/bitacora y en
 * /administrador/bitacora (ver esos dos archivos): el layout privado ya
 * se encarga de que cada rol solo pueda entrar a la ruta que le toca,
 * igual que con el tablero de gateways.
 */
export default function BitacoraEventos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [estado, setEstado] = useState<EstadoCarga>("cargando");
  const [mensajeError, setMensajeError] = useState("");

  // Acción y rango de fechas van al servidor como query params: cada
  // cambio vuelve a pedir GET /api/eventos, sin recargar la página.
  const [accion, setAccion] = useState<AccionEvento | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // El número de pedido NO es un filtro del backend (que solo acepta
  // ?pedidoId= con el _id de Mongo, no el texto PED-EQUI...), así que se
  // aplica del lado del cliente sobre lo que ya se trajo.
  const [numeroPedido, setNumeroPedido] = useState("");

  useEffect(() => {
    const controlador = new AbortController();

    async function cargar() {
      setEstado("cargando");
      setMensajeError("");

      const params = new URLSearchParams();
      if (accion) params.set("accion", accion);
      if (desde) params.set("desde", new Date(`${desde}T00:00:00`).toISOString());
      if (hasta) params.set("hasta", new Date(`${hasta}T23:59:59.999`).toISOString());

      try {
        const res = await fetch(`${API}/api/eventos?${params.toString()}`, {
          headers: { Authorization: `Bearer ${obtenerToken()}` },
          signal: controlador.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          setEstado("error");
          setMensajeError(data.mensaje ?? "No se pudo cargar la bitácora.");
          return;
        }

        setEventos(data);
        setEstado("lista");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setEstado("error");
        setMensajeError("No se pudo conectar con el servidor.");
      }
    }

    cargar();
    return () => controlador.abort();
  }, [accion, desde, hasta]);

  const eventosFiltrados = useMemo(() => {
    const filtro = numeroPedido.trim().toUpperCase();
    if (!filtro) return eventos;
    return eventos.filter((evento) => evento.pedidoId?.numeroPedido?.toUpperCase().includes(filtro));
  }, [eventos, numeroPedido]);

  function limpiarFiltros() {
    setAccion("");
    setDesde("");
    setHasta("");
    setNumeroPedido("");
  }

  return (
    <main className="container-fluid py-2">
      <h1 className="h3 mb-4">Bitácora de eventos</h1>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-4">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label htmlFor="filtroAccion" className="form-label">
                Acción
              </label>
              <select
                id="filtroAccion"
                className="form-select"
                value={accion}
                onChange={(e) => setAccion(e.target.value as AccionEvento | "")}
              >
                <option value="">Todas</option>
                {ACCIONES_EVENTO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ETIQUETA_ACCION[valor]}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label htmlFor="filtroPedido" className="form-label">
                N.º de pedido
              </label>
              <input
                id="filtroPedido"
                type="text"
                className="form-control"
                placeholder="PED-EQUI04-..."
                value={numeroPedido}
                onChange={(e) => setNumeroPedido(e.target.value)}
              />
            </div>

            <div className="col-md-2">
              <label htmlFor="filtroDesde" className="form-label">
                Desde
              </label>
              <input
                id="filtroDesde"
                type="date"
                className="form-control"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>

            <div className="col-md-2">
              <label htmlFor="filtroHasta" className="form-label">
                Hasta
              </label>
              <input
                id="filtroHasta"
                type="date"
                className="form-control"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>

            <div className="col-md-2">
              <button type="button" className="btn btn-outline-secondary w-100" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {estado === "error" && (
        <div className="alert alert-danger" role="alert">
          {mensajeError}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-striped align-middle">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Acción</th>
              <th>Usuario</th>
              <th>N.º pedido</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {estado === "cargando" && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  Cargando...
                </td>
              </tr>
            )}

            {estado === "lista" &&
              eventosFiltrados.map((evento) => (
                <tr key={evento._id}>
                  <td>{formatearFechaHora(evento.fechaHora)}</td>
                  <td>
                    {ETIQUETA_ACCION[evento.accion] ?? evento.accion}{" "}
                    {esAutomatico(evento) && (
                      <span className="badge bg-info text-dark ms-1">Automática</span>
                    )}
                  </td>
                  <td>
                    {evento.usuarioId ? (
                      <>
                        {evento.usuarioId.nombre}
                        <span className="text-muted small"> ({evento.usuarioId.rol})</span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>{evento.pedidoId?.numeroPedido ?? <span className="text-muted">—</span>}</td>
                  <td className="small">{resumirDetalles(evento)}</td>
                </tr>
              ))}

            {estado === "lista" && eventosFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  No hay eventos que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
