"use client";

import { useState } from "react";
import { reevaluarCola } from "@/lib/cola";

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-SV", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function textoPedidosQueSubieron(cantidad: number): string {
  if (cantidad === 0) return "Ningún pedido subió de prioridad";
  if (cantidad === 1) return "1 pedido subió de prioridad";
  return `${cantidad} pedidos subieron de prioridad`;
}

interface EncabezadoColaProps {
  totalPedidos: number;
  factorAgingMin: number;
  limiteEsperaMax: number;
  generadoEn: string;
  onReevaluado: () => void;
}

/** Resumen de la cola y el botón para forzar un recálculo de prioridades. */
export default function EncabezadoCola({
  totalPedidos,
  factorAgingMin,
  limiteEsperaMax,
  generadoEn,
  onReevaluado,
}: EncabezadoColaProps) {
  const [reevaluando, setReevaluando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function manejarReevaluar() {
    setReevaluando(true);
    setMensaje("");

    const resultado = await reevaluarCola();

    setReevaluando(false);

    if (!resultado.ok || !resultado.datos) {
      setMensaje(resultado.mensaje ?? "No se pudo reevaluar la cola");
      return;
    }

    setMensaje(textoPedidosQueSubieron(resultado.datos.pedidosQueSubieronDePrioridad));
    onReevaluado();
  }

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h1 className="h4 mb-1">Cola de espera</h1>
          <p className="small text-muted mb-1">
            {totalPedidos} {totalPedidos === 1 ? "pedido" : "pedidos"} en cola · cada {factorAgingMin} min de
            espera sube un nivel de prioridad · alerta visual a partir de {limiteEsperaMax} min
          </p>
          <p className="small text-muted mb-0">
            Última actualización: {formatearHora(generadoEn)} (El Salvador)
          </p>
        </div>

        <div className="d-flex flex-column align-items-end gap-1">
          <button
            type="button"
            className="btn btn-primary"
            onClick={manejarReevaluar}
            disabled={reevaluando}
          >
            {reevaluando && (
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            )}
            Reevaluar prioridades
          </button>
          {mensaje && <span className="small text-muted">{mensaje}</span>}
        </div>
      </div>
    </div>
  );
}
