"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CajaTooltip from "@/components/dashboard/CajaTooltip";
import TarjetaIndicador from "@/components/dashboard/TarjetaIndicador";
import { COLOR_CARGA, capitalizar, colorCarga, duracionLarga, minutos, type Kpis } from "@/lib/kpis";

/** Ocupación por muelle: una barra horizontal por gateway, de 0 a 100 %. */
export default function OcupacionChart({ datos }: { datos: Kpis["ocupacionPorMuelle"] }) {
  const sinDatos = datos.length === 0 || datos.every((d) => d.minutosOperativos === 0);

  const filas = datos.map((d) => ({
    ...d,
    nombre: `Gateway ${d.numeroGateway}`,
    etiqueta: `${minutos(d.porcentaje)} %`,
  }));

  return (
    <TarjetaIndicador
      titulo="Ocupación por muelle"
      subtitulo="% del horario operativo que cada bahía estuvo descargando"
      sinDatos={sinDatos}
      mensajeSinDatos="No hay días hábiles en este período"
    >
      <div className="d-flex flex-wrap gap-3 small mb-2" style={{ color: "#5b6472" }}>
        {Object.entries(COLOR_CARGA).map(([tipo, color]) => (
          <span key={tipo} className="d-inline-flex align-items-center gap-2">
            <span className="d-inline-block rounded-1" style={{ width: 10, height: 10, background: color }} />
            Carga {tipo}
          </span>
        ))}
      </div>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="#eef0f4" />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              unit=" %"
              tickLine={false}
              axisLine={{ stroke: "#d6dee8" }}
              tick={{ fill: "#5b6472", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="nombre"
              width={84}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#1f2a44", fontSize: 13, fontWeight: 600 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(16,24,40,0.04)" }}
              content={({ active, payload }) => {
                const fila = payload?.[0]?.payload;
                if (!active || !fila) return null;
                return (
                  <CajaTooltip
                    titulo={`${fila.nombre} · ${capitalizar(fila.tipoCargaPermitida)}`}
                    color={colorCarga(fila.tipoCargaPermitida)}
                    lineas={[
                      `Ocupado: ${fila.etiqueta}`,
                      `${duracionLarga(fila.minutosOcupado)} de ${duracionLarga(fila.minutosOperativos)} operativos`,
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="porcentaje" radius={[0, 4, 4, 0]} maxBarSize={26}>
              {filas.map((f) => (
                <Cell key={f.numeroGateway} fill={colorCarga(f.tipoCargaPermitida)} />
              ))}
              <LabelList dataKey="etiqueta" position="right" fill="#1f2a44" fontSize={12} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TarjetaIndicador>
  );
}
