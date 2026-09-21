"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSesion } from "@/components/SesionProvider";
import { obtenerToken } from "@/lib/session";

const COLOR_PROVEEDORES = "#0d6efd";
const COLOR_PEDIDOS = "#198754";

export default function PaginaCoordinador() {
  const { rol, correo } = useSesion();

  const [totalProveedores, setTotalProveedores] = useState<number | null>(null);
  const [totalPedidos, setTotalPedidos] = useState<number | null>(null);

  useEffect(() => {
    const token = obtenerToken();
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/proveedores`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((datos) => setTotalProveedores(Array.isArray(datos) ? datos.length : 0))
      .catch(() => setTotalProveedores(0));

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pedidos`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((datos) => setTotalPedidos(Array.isArray(datos) ? datos.length : 0))
      .catch(() => setTotalPedidos(0));
  }, []);

  const fechaHoy = new Date().toLocaleDateString("es-SV", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="h3 mb-1">Panel del {rol}</h1>
        <p className="text-muted mb-0">Resumen general de la gestión logística</p>
        <p className="text-muted small mb-0">
          <span className="text-capitalize">{fechaHoy}</span> · Sesión de {correo}
        </p>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <Link href="/coordinador/proveedores" className="text-decoration-none">
            <div
              className="card border-0 shadow-sm h-100 tarjeta-hover"
              style={{ borderTop: `3px solid ${COLOR_PROVEEDORES}` }}
            >
              <div className="card-body py-3 d-flex align-items-center gap-3">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{
                    width: "44px",
                    height: "44px",
                    backgroundColor: `${COLOR_PROVEEDORES}1a`,
                    fontSize: "1.2rem",
                  }}
                >
                  🏢
                </div>
                <div className="flex-grow-1">
                  <div className="text-muted small">Proveedores</div>
                  <div className="fs-4 fw-semibold text-dark">
                    {totalProveedores === null ? (
                      <span className="spinner-border spinner-border-sm text-primary" role="status" />
                    ) : (
                      totalProveedores
                    )}
                  </div>
                </div>
                <span className="text-muted">→</span>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-6 col-md-3">
          <Link href="/coordinador/pedidos" className="text-decoration-none">
            <div
              className="card border-0 shadow-sm h-100 tarjeta-hover"
              style={{ borderTop: `3px solid ${COLOR_PEDIDOS}` }}
            >
              <div className="card-body py-3 d-flex align-items-center gap-3">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{
                    width: "44px",
                    height: "44px",
                    backgroundColor: `${COLOR_PEDIDOS}1a`,
                    fontSize: "1.2rem",
                  }}
                >
                  📅
                </div>
                <div className="flex-grow-1">
                  <div className="text-muted small">Pedidos</div>
                  <div className="fs-4 fw-semibold text-dark">
                    {totalPedidos === null ? (
                      <span className="spinner-border spinner-border-sm" style={{ color: COLOR_PEDIDOS }} role="status" />
                    ) : (
                      totalPedidos
                    )}
                  </div>
                </div>
                <span className="text-muted">→</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <h2 className="h5 mb-3">Acciones rápidas</h2>

      <div className="row g-3">
        <div className="col-12 col-sm-6 col-lg-4">
          <div className="card h-100 shadow-sm border-0 tarjeta-hover">
            <div className="card-body d-flex flex-column">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
                style={{
                  width: "56px",
                  height: "56px",
                  backgroundColor: `${COLOR_PROVEEDORES}1a`,
                  fontSize: "1.5rem",
                }}
              >
                🏢
              </div>
              <h5 className="card-title text-dark">Registrar proveedores</h5>
              <p className="card-text text-muted small">
                Administra los proveedores registrados en el sistema.
              </p>
              <div
                className="rounded-2 px-3 py-2 small mb-3"
                style={{ backgroundColor: `${COLOR_PROVEEDORES}0d` }}
              >
                {totalProveedores === null ? "Cargando…" : `${totalProveedores} proveedores registrados`}
              </div>
              <Link href="/coordinador/proveedores" className="btn btn-primary mt-auto">
                Gestionar proveedores →
              </Link>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-4">
          <div className="card h-100 shadow-sm border-0 tarjeta-hover">
            <div className="card-body d-flex flex-column">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
                style={{
                  width: "56px",
                  height: "56px",
                  backgroundColor: `${COLOR_PEDIDOS}1a`,
                  fontSize: "1.5rem",
                }}
              >
                📅
              </div>
              <h5 className="card-title text-dark">Agenda de pedidos</h5>
              <p className="card-text text-muted small">
                Programa y consulta las citas de recepción de pedidos.
              </p>
              <div
                className="rounded-2 px-3 py-2 small mb-3"
                style={{ backgroundColor: `${COLOR_PEDIDOS}0d` }}
              >
                {totalPedidos === null
                  ? "Cargando…"
                  : `${totalPedidos} pedido${totalPedidos === 1 ? "" : "s"} programado${totalPedidos === 1 ? "" : "s"}`}
              </div>
              <Link href="/coordinador/pedidos" className="btn btn-success mt-auto">
                Ver agenda →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}