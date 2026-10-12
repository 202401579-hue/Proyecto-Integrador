"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CajaTooltip from "@/components/dashboard/CajaTooltip";
import TarjetaIndicador from "@/components/dashboard/TarjetaIndicador";
import { etiquetaDia, fechaLarga, type Kpis } from "@/lib/kpis";

const AZUL = "#2f5fb3";

/** Volumen diario: pedidos finalizados por día (hora de El Salvador). */
export default function VolumenDiarioChart({ datos }: { datos: Kpis["volumenDiario"] }) {
  const total = datos.reduce((suma, d) => suma + d.finalizados, 0);
  const filas = datos.map((d) => ({ ...d, dia: etiquetaDia(d.fecha) }));
  // Con muchos días, un número arriba de cada barra se amontona: solo se
  // muestran hasta 14 días; con más, el valor queda en el tooltip.
  const conEtiquetas = filas.length <= 14;

  return (
    <TarjetaIndicador
      titulo="Volumen diario"
      subtitulo={`Pedidos finalizados por día · ${total} en el período`}
      sinDatos={datos.length === 0 || total === 0}
      mensajeSinDatos="No se finalizó ningún pedido en este período"
    >
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 24, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef0f4" />
            <XAxis
              dataKey="dia"
              tickLine={false}
              axisLine={{ stroke: "#d6dee8" }}
              tick={{ fill: "#5b6472", fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#5b6472", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(16,24,40,0.04)" }}
              content={({ active, payload }) => {
                const fila = payload?.[0]?.payload;
                if (!active || !fila) return null;
                return (
                  <CajaTooltip
                    titulo={fechaLarga(fila.fecha)}
                    color={AZUL}
                    lineas={[`${fila.finalizados} ${fila.finalizados === 1 ? "pedido finalizado" : "pedidos finalizados"}`]}
                  />
                );
              }}
            />
            <Bar dataKey="finalizados" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={48}>
              {conEtiquetas && (
                <LabelList dataKey="finalizados" position="top" fill="#1f2a44" fontSize={12} fontWeight={700} />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TarjetaIndicador>
  );
}
