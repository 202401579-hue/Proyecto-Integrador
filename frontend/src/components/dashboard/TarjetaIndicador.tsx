"use client";

import type { ReactNode } from "react";

interface TarjetaIndicadorProps {
  titulo: string;
  // Unidad o aclaración que va siempre visible debajo del título.
  subtitulo: string;
  // Cuando es true se muestra el mensaje en lugar del gráfico vacío.
  sinDatos?: boolean;
  mensajeSinDatos?: string;
  children: ReactNode;
}

/** Marco común de cada indicador: título, unidad y el aviso de "sin datos". */
export default function TarjetaIndicador({
  titulo,
  subtitulo,
  sinDatos = false,
  mensajeSinDatos = "Sin datos en este período",
  children,
}: TarjetaIndicadorProps) {
  return (
    <section
      className="bg-white h-100 p-3 p-md-4 d-flex flex-column"
      style={{ borderRadius: 14, boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 6px 16px rgba(16,24,40,0.07)" }}
    >
      <h2 className="h6 fw-bold mb-0" style={{ color: "#1f2a44" }}>
        {titulo}
      </h2>
      <p className="small mb-3" style={{ color: "#5b6472" }}>
        {subtitulo}
      </p>
      {sinDatos ? (
        <div
          className="flex-grow-1 d-flex align-items-center justify-content-center text-center small rounded-3 py-5"
          style={{ background: "#f4f6f9", color: "#5b6472" }}
        >
          {mensajeSinDatos}
        </div>
      ) : (
        <div className="flex-grow-1">{children}</div>
      )}
    </section>
  );
}
