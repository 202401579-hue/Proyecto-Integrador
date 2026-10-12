"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CajaTooltip from "@/components/dashboard/CajaTooltip";
import TarjetaIndicador from "@/components/dashboard/TarjetaIndicador";
import { capitalizar, colorCarga, minutos, type Kpis } from "@/lib/kpis";

/** Tiempo de descarga promedio: barras, general contra construcción. */
export default function TiempoDescargaChart({ datos }: { datos: Kpis["tiempoDescarga"] }) {
  const sinDatos = datos.every((d) => d.cantidad === 0);

  const filas = datos.map((d) => ({
    tipoCarga: d.tipoCarga,
    nombre: capitalizar(d.tipoCarga),
    promedio: d.promedioMinutos ?? 0,
    etiqueta: d.promedioMinutos === null ? "sin datos" : `${minutos(d.promedioMinutos)} min`,
    cantidad: d.cantidad,
  }));

  return (
    <TarjetaIndicador
      titulo="Tiempo de descarga promedio"
      subtitulo="Minutos por descarga, según el tipo de carga"
      sinDatos={sinDatos}
      mensajeSinDatos="No se finalizó ninguna descarga en este período"
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 28, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef0f4" />
            <XAxis dataKey="nombre" tickLine={false} axisLine={{ stroke: "#d6dee8" }} tick={{ fill: "#5b6472", fontSize: 13 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#5b6472", fontSize: 12 }} unit=" min" width={64} />
            <Tooltip
              cursor={{ fill: "rgba(16,24,40,0.04)" }}
              content={({ active, payload }) => {
                const fila = payload?.[0]?.payload;
                if (!active || !fila) return null;
                return (
                  <CajaTooltip
                    titulo={fila.nombre}
                    color={colorCarga(fila.tipoCarga)}
                    lineas={[`Promedio: ${fila.etiqueta}`, `${fila.cantidad} descargas finalizadas`]}
                  />
                );
              }}
            />
            <Bar dataKey="promedio" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {filas.map((f) => (
                <Cell key={f.tipoCarga} fill={colorCarga(f.tipoCarga)} />
              ))}
              <LabelList dataKey="etiqueta" position="top" fill="#1f2a44" fontSize={13} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TarjetaIndicador>
  );
}
