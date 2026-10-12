"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import CumplimientoChart from "@/components/dashboard/CumplimientoChart";
import OcupacionChart from "@/components/dashboard/OcupacionChart";
import TiempoDescargaChart from "@/components/dashboard/TiempoDescargaChart";
import TiempoEsperaCard from "@/components/dashboard/TiempoEsperaCard";
import VolumenDiarioChart from "@/components/dashboard/VolumenDiarioChart";
import { obtenerToken } from "@/lib/session";
import { fechaLarga, type Kpis } from "@/lib/kpis";

const API = process.env.NEXT_PUBLIC_API_URL;
const AZUL = "#2f5fb3";

/**
 * Dashboard de indicadores. Los cinco KPIs los calcula el backend en
 * GET /api/kpis; esta pantalla solo los pide y los dibuja. Sin fechas, el
 * backend devuelve los últimos 7 días (incluido hoy, hora de El Salvador).
 */
export default function KpisDashboard() {
  const [datos, setDatos] = useState<Kpis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Valores de los dos campos de fecha (AAAA-MM-DD, lo que usa <input type="date">).
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async (rango?: { desde: string; hasta: string }) => {
    setCargando(true);
    setError("");
    try {
      const query = rango ? `?desde=${rango.desde}&hasta=${rango.hasta}` : "";
      const respuesta = await fetch(`${API}/api/kpis${query}`, {
        headers: { Authorization: `Bearer ${obtenerToken()}` },
      });
      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        setError(cuerpo?.mensaje ?? "No se pudieron cargar los indicadores");
        return;
      }

      const kpis = cuerpo as Kpis;
      setDatos(kpis);
      // Los campos muestran el período que realmente calculó el backend.
      setDesde(kpis.periodo.desde);
      setHasta(kpis.periodo.hasta);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }, []);

  // Primera carga sin parámetros (últimos 7 días). Va en un callback y no
  // directo en el cuerpo del efecto, por la regla react-hooks/set-state-in-effect.
  useEffect(() => {
    const primeraCarga = setTimeout(() => cargar(), 0);
    return () => clearTimeout(primeraCarga);
  }, [cargar]);

  function aplicarRango(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!desde || !hasta) {
      setError("Elegí las dos fechas del rango");
      return;
    }
    if (desde > hasta) {
      setError("La fecha \"desde\" no puede ser posterior a \"hasta\"");
      return;
    }
    cargar({ desde, hasta });
  }

  return (
    <div className="d-flex flex-column gap-4">
      {/* Encabezado y selector de rango */}
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <h1 className="h3 mb-1">Indicadores logísticos</h1>
          <p className="mb-0" style={{ color: "#5b6472" }}>
            {datos
              ? `Del ${fechaLarga(datos.periodo.desde)} al ${fechaLarga(datos.periodo.hasta)} · hora de El Salvador`
              : "Cargando el período..."}
          </p>
        </div>

        <form className="d-flex flex-wrap align-items-end gap-2" onSubmit={aplicarRango}>
          <div>
            <label htmlFor="kpi-desde" className="form-label small mb-1" style={{ color: "#5b6472" }}>
              Desde
            </label>
            <input
              id="kpi-desde"
              type="date"
              className="form-control form-control-sm"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="kpi-hasta" className="form-label small mb-1" style={{ color: "#5b6472" }}>
              Hasta
            </label>
            <input
              id="kpi-hasta"
              type="date"
              className="form-control form-control-sm"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-sm fw-semibold"
            style={{ background: AZUL, color: "#ffffff", borderColor: AZUL, minHeight: 31 }}
            disabled={cargando}
          >
            Aplicar
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => cargar()}
            disabled={cargando}
          >
            Últimos 7 días
          </button>
        </form>
      </div>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center py-2 mb-0" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-close" aria-label="Cerrar aviso" onClick={() => setError("")} />
        </div>
      )}

      {!datos ? (
        <div className="text-center text-muted py-5">
          {cargando && <div className="spinner-border spinner-border-sm me-2" role="status" />}
          {cargando ? "Cargando indicadores..." : "No hay indicadores para mostrar."}
        </div>
      ) : (
        // Mientras llega un rango nuevo se siguen viendo los datos anteriores, un poco atenuados.
        <div style={{ opacity: cargando ? 0.55 : 1, transition: "opacity 0.15s ease" }}>
          <div className="row g-4">
            <div className="col-12 col-lg-4">
              <TiempoEsperaCard datos={datos.tiempoEspera} />
            </div>
            <div className="col-12 col-lg-8">
              <VolumenDiarioChart datos={datos.volumenDiario} />
            </div>
            <div className="col-12 col-xl-6">
              <CumplimientoChart datos={datos.cumplimiento} />
            </div>
            <div className="col-12 col-xl-6">
              <TiempoDescargaChart datos={datos.tiempoDescarga} />
            </div>
            <div className="col-12">
              <OcupacionChart datos={datos.ocupacionPorMuelle} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
