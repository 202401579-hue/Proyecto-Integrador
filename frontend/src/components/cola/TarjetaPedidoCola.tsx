"use client";

import BadgeEspera from "@/components/cola/BadgeEspera";
import BadgePuntualidad from "@/components/cola/BadgePuntualidad";
import type { ItemCola } from "@/lib/cola";

const CLASE_POR_TIPO: Record<string, string> = {
  general: "bg-primary-subtle text-primary-emphasis",
  construcción: "bg-dark-subtle text-dark",
};

const CLASE_TIPO_DESCONOCIDO = "bg-secondary-subtle text-dark";

function formatearHoraProgramada(iso: string): string {
  return new Date(iso).toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

interface TarjetaPedidoColaProps {
  item: ItemCola;
}

/** Una tarjeta de la cola. No decide su posición: la que le llega es la que muestra. */
export default function TarjetaPedidoCola({ item }: TarjetaPedidoColaProps) {
  const subioPorAging = item.prioridadCalculada > item.prioridadBase;
  const claseTipo = CLASE_POR_TIPO[item.tipoProducto] ?? CLASE_TIPO_DESCONOCIDO;

  return (
    <div className="card h-100 shadow-sm">
      <div className="card-body d-flex flex-column gap-2">
        <div className="d-flex justify-content-between align-items-start">
          <span className="badge bg-dark fs-6" title="Posición en la cola">
            #{item.posicion}
          </span>
          <span className={`badge ${claseTipo}`}>{item.tipoProducto}</span>
        </div>

        <h2 className="h6 mb-0 text-break">{item.numeroPedido}</h2>
        <p className="small text-muted mb-0 text-break">{item.proveedor?.nombre ?? "—"}</p>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <BadgePuntualidad puntualidad={item.puntualidad} />
          <span className="small fw-semibold">
            Prioridad:{" "}
            {subioPorAging ? (
              <span title="Subió por el tiempo de espera (aging)">
                {item.prioridadBase} → {item.prioridadCalculada}
              </span>
            ) : (
              item.prioridadCalculada
            )}
          </span>
        </div>

        <div>
          <BadgeEspera minutosEnEspera={item.minutosEnEspera} excedeLimite={item.excedeLimite} />
        </div>

        <p className="small text-muted mb-0 mt-auto">
          Programado: {formatearHoraProgramada(item.fechaHoraProgramada)} (El Salvador)
        </p>
      </div>
    </div>
  );
}
