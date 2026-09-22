"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

type Proveedor = {
  _id: string;
  razonSocial: string;
};

type Alternativa = {
  inicioVentana: string;
  finVentana: string;
};

type Pedido = {
  _id: string;
  numeroPedido: string;
  proveedorId: Proveedor;
  tipoProducto: string;
  inicioVentana: string;
  finVentana: string;
  estado: string;
};

type EstadoEnvio = "reposo" | "cargando" | "error" | "conflicto" | "exito";

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aDatetimeLocal(iso: string) {
  const fecha = new Date(iso);
  const offsetMs = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function PedidosPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [numeroPedido, setNumeroPedido] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [tipoProducto, setTipoProducto] = useState("construcción");
  const [fechaHoraProgramada, setFechaHoraProgramada] = useState("");
  const [duracionEstimadaMinutos, setDuracionEstimadaMinutos] = useState("");

  const [estado, setEstado] = useState<EstadoEnvio>("reposo");
  const [mensaje, setMensaje] = useState("");
  const [alternativas, setAlternativas] = useState<Alternativa[]>([]);

  const cargando = estado === "cargando";

  async function cargarProveedores() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API}/api/proveedores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProveedores(data);
    }
  }

  async function cargarPedidos() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API}/api/pedidos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setPedidos(data);
    }
  }

  useEffect(() => {
    cargarProveedores();
    cargarPedidos();
  }, []);

  function limpiarFormulario() {
    setNumeroPedido("");
    setProveedorId("");
    setTipoProducto("construcción");
    setFechaHoraProgramada("");
    setDuracionEstimadaMinutos("");
  }

  function usarAlternativa(alt: Alternativa) {
    const minutos = Math.round(
      (new Date(alt.finVentana).getTime() - new Date(alt.inicioVentana).getTime()) / 60000
    );
    setFechaHoraProgramada(aDatetimeLocal(alt.inicioVentana));
    setDuracionEstimadaMinutos(String(minutos));
    setEstado("reposo");
    setMensaje("");
    setAlternativas([]);
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEstado("cargando");
    setMensaje("");
    setAlternativas([]);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API}/api/pedidos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          numeroPedido,
          proveedorId,
          tipoProducto,
          fechaHoraProgramada: new Date(fechaHoraProgramada).toISOString(),
          duracionEstimadaMinutos: Number(duracionEstimadaMinutos),
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        setEstado("exito");
        setMensaje("Pedido agendado correctamente.");
        limpiarFormulario();
        cargarPedidos();
        return;
      }

      if (res.status === 409) {
        setEstado("conflicto");
        setMensaje(data.mensaje);
        setAlternativas(data.alternativas ?? []);
        return;
      }

      setEstado("error");
      setMensaje(data.mensaje ?? "No se pudo agendar el pedido.");
    } catch {
      setEstado("error");
      setMensaje("No se pudo conectar con el servidor.");
    }
  }

  return (
    <main className="container py-4">
      <h1 className="h3 mb-4">Agenda de pedidos</h1>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-4">
          <form onSubmit={manejarEnvio} noValidate>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="numeroPedido" className="form-label">
                  Número de pedido
                </label>
                <input
                  id="numeroPedido"
                  className="form-control"
                  placeholder="OC-2026-0147"
                  required
                  value={numeroPedido}
                  onChange={(e) => setNumeroPedido(e.target.value)}
                  disabled={cargando}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="proveedorId" className="form-label">
                  Proveedor
                </label>
                <select
                  id="proveedorId"
                  className="form-select"
                  required
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  disabled={cargando}
                >
                  <option value="" disabled>
                    Selecciona un proveedor
                  </option>
                  {proveedores.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.razonSocial}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label htmlFor="tipoProducto" className="form-label">
                  Tipo de producto
                </label>
                <select
                  id="tipoProducto"
                  className="form-select"
                  required
                  value={tipoProducto}
                  onChange={(e) => setTipoProducto(e.target.value)}
                  disabled={cargando}
                >
                  <option value="construcción">construcción</option>
                  <option value="general">general</option>
                </select>
              </div>

              <div className="col-md-3">
                <label htmlFor="fechaHoraProgramada" className="form-label">
                  Fecha y hora
                </label>
                <input
                  id="fechaHoraProgramada"
                  type="datetime-local"
                  className="form-control"
                  required
                  value={fechaHoraProgramada}
                  onChange={(e) => setFechaHoraProgramada(e.target.value)}
                  disabled={cargando}
                />
              </div>

              <div className="col-md-3">
                <label htmlFor="duracionEstimadaMinutos" className="form-label">
                  Duración (min)
                </label>
                <input
                  id="duracionEstimadaMinutos"
                  type="number"
                  min={1}
                  className="form-control"
                  required
                  value={duracionEstimadaMinutos}
                  onChange={(e) => setDuracionEstimadaMinutos(e.target.value)}
                  disabled={cargando}
                />
              </div>
            </div>

            {estado === "error" && (
              <div className="alert alert-danger mt-3 py-2 mb-0" role="alert">
                {mensaje}
              </div>
            )}

            {estado === "exito" && (
              <div className="alert alert-success mt-3 py-2 mb-0" role="alert">
                {mensaje}
              </div>
            )}

            {estado === "conflicto" && (
              <div className="alert alert-warning mt-3 py-2" role="alert">
                <p className="mb-2">{mensaje}</p>
                <p className="mb-2 fw-semibold">Horarios alternativos disponibles:</p>
                <div className="d-flex flex-column gap-2">
                  {alternativas.map((alt, i) => (
                    <button
                      key={i}
                      type="button"
                      className="btn btn-outline-primary btn-sm text-start"
                      onClick={() => usarAlternativa(alt)}
                    >
                      {formatearFecha(alt.inicioVentana)} – {formatearFecha(alt.finVentana)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary mt-3"
              disabled={cargando}
            >
              {cargando ? "Agendando..." : "Agendar pedido"}
            </button>
          </form>
        </div>
      </div>

      <h2 className="h5 mb-3">Pedidos agendados</h2>
      <div className="table-responsive">
        <table className="table table-striped align-middle">
          <thead>
            <tr>
              <th>N.º pedido</th>
              <th>Proveedor</th>
              <th>Tipo</th>
              <th>Ventana</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p._id}>
                <td>{p.numeroPedido}</td>
                <td>{p.proveedorId?.razonSocial}</td>
                <td>{p.tipoProducto}</td>
                <td>
                  {formatearFecha(p.inicioVentana)} – {formatearFecha(p.finVentana)}
                </td>
                <td>{p.estado}</td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted">
                  Todavía no hay pedidos agendados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
