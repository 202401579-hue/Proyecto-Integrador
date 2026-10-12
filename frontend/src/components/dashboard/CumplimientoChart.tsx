"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import CajaTooltip from "@/components/dashboard/CajaTooltip";
import TarjetaIndicador from "@/components/dashboard/TarjetaIndicador";
import { COLOR_PUNTUALIDAD, minutos, type Kpis } from "@/lib/kpis";

/**
 * Cumplimiento de citas: dona con las cuatro puntualidades. La leyenda de
 * al lado repite cada valor en texto, así la lectura no depende solo del
 * color (el celeste y el amarillo tienen poco contraste sobre blanco).
 */
export default function CumplimientoChart({ datos }: { datos: Kpis["cumplimiento"] }) {
  const sinDatos = datos.total === 0;
  // La dona solo dibuja las porciones con valor; la leyenda muestra las cuatro.
  const porciones = datos.distribucion.filter((d) => d.cantidad > 0);

  return (
    <TarjetaIndicador
      titulo="Cumplimiento de citas"
      subtitulo="Puntualidad de los pedidos con cita en el período (% del total)"
      sinDatos={sinDatos}
      mensajeSinDatos="No hay pedidos con puntualidad registrada en este período"
    >
      <div className="row g-3 align-items-center">
        <div className="col-12 col-sm-6">
          <div className="position-relative" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porciones}
                  dataKey="cantidad"
                  nameKey="puntualidad"
                  innerRadius="62%"
                  outerRadius="95%"
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {porciones.map((d) => (
                    <Cell key={d.puntualidad} fill={COLOR_PUNTUALIDAD[d.puntualidad] ?? "#6c757d"} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    const fila = payload?.[0]?.payload;
                    if (!active || !fila) return null;
                    return (
                      <CajaTooltip
                        titulo={fila.puntualidad}
                        color={COLOR_PUNTUALIDAD[fila.puntualidad as keyof typeof COLOR_PUNTUALIDAD]}
                        lineas={[`${fila.cantidad} pedidos · ${minutos(fila.porcentaje)} %`]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Total en el centro de la dona */}
            <div
              className="position-absolute top-50 start-50 translate-middle text-center"
              style={{ pointerEvents: "none" }}
            >
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: "#1f2a44" }}>{datos.total}</div>
              <div className="small" style={{ color: "#5b6472" }}>
                pedidos
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6">
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {datos.distribucion.map((d) => (
              <li key={d.puntualidad} className="d-flex align-items-center gap-2">
                <span
                  className="d-inline-block rounded-1 flex-shrink-0"
                  style={{ width: 12, height: 12, background: COLOR_PUNTUALIDAD[d.puntualidad] ?? "#6c757d" }}
                />
                <span className="flex-grow-1 small fw-semibold" style={{ color: "#1f2a44" }}>
                  {d.puntualidad}
                </span>
                <span className="small" style={{ color: "#5b6472" }}>
                  {d.cantidad}
                </span>
                <span className="small fw-bold text-end" style={{ color: "#1f2a44", minWidth: 56 }}>
                  {minutos(d.porcentaje)} %
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TarjetaIndicador>
  );
}
