"use client";

import TarjetaIndicador from "@/components/dashboard/TarjetaIndicador";
import { minutos, type Kpis } from "@/lib/kpis";

/** Tiempo de espera: una cifra grande, no hace falta un gráfico para un solo número. */
export default function TiempoEsperaCard({ datos }: { datos: Kpis["tiempoEspera"] }) {
  const sinDatos = datos.promedioMinutos === null || datos.cantidad === 0;

  return (
    <TarjetaIndicador
      titulo="Tiempo de espera promedio"
      subtitulo="Desde que el camión llega hasta que empieza a descargar"
      sinDatos={sinDatos}
      mensajeSinDatos="No se inició ninguna descarga en este período"
    >
      <div className="h-100 d-flex flex-column justify-content-center py-2">
        <div className="d-flex align-items-baseline gap-2">
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: "#1f2a44" }}>
            {datos.promedioMinutos !== null ? minutos(datos.promedioMinutos) : "—"}
          </span>
          <span className="fs-4 fw-semibold" style={{ color: "#5b6472" }}>
            min
          </span>
        </div>
        <p className="mt-3 mb-0" style={{ color: "#5b6472" }}>
          Promedio de{" "}
          <strong style={{ color: "#1f2a44" }}>
            {datos.cantidad} {datos.cantidad === 1 ? "descarga" : "descargas"}
          </strong>{" "}
          iniciadas en el período.
        </p>
      </div>
    </TarjetaIndicador>
  );
}
