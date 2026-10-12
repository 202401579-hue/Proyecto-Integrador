"use client";

/** Tooltip común de los gráficos: un título y una o dos líneas de detalle. */
export default function CajaTooltip({
  titulo,
  lineas,
  color,
}: {
  titulo: string;
  lineas: string[];
  color?: string;
}) {
  return (
    <div
      className="bg-white small px-3 py-2"
      style={{ borderRadius: 8, boxShadow: "0 4px 16px rgba(16,24,40,0.15)", border: "1px solid #eef0f4" }}
    >
      <div className="fw-bold d-flex align-items-center gap-2" style={{ color: "#1f2a44" }}>
        {color && (
          <span className="d-inline-block rounded-1" style={{ width: 10, height: 10, background: color }} />
        )}
        {titulo}
      </div>
      {lineas.map((linea) => (
        <div key={linea} style={{ color: "#5b6472" }}>
          {linea}
        </div>
      ))}
    </div>
  );
}
