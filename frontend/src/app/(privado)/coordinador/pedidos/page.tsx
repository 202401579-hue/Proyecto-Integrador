"use client";

import { Fragment, FormEvent, useEffect, useState } from "react";
import { claseColorEstado, claseTextoEstado } from "@/lib/estados";

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
  fechaHoraLlegadaReal?: string | null;
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

function minutosEntre(inicioIso: string, finIso: string) {
  return Math.round((new Date(finIso).getTime() - new Date(inicioIso).getTime()) / 60000);
}

// Solo tiene sentido cancelar o reprogramar un pedido que todavia no
// llego o que llego tarde y nunca se presento. Los que ya tienen una
// llegada registrada (ANTICIPADO, A TIEMPO, TARDIO) o que ya estan
// CANCELADO quedan fuera; el backend igual lo rechaza con 400, esto
// solo evita ofrecer un boton que se sabe que va a fallar.
const ESTADOS_ACCIONABLES = ["PROGRAMADO", "AUSENTE"];

export default function PedidosPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  // --- Formulario principal: crear o editar ---
  const [idEditando, setIdEditando] = useState<string | null>(null);
  const [numeroPedido, setNumeroPedido] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [tipoProducto, setTipoProducto] = useState("construcción");
  const [fechaHoraProgramada, setFechaHoraProgramada] = useState("");
  const [duracionEstimadaMinutos, setDuracionEstimadaMinutos] = useState("");

  const [estado, setEstado] = useState<EstadoEnvio>("reposo");
  const [mensaje, setMensaje] = useState("");
  const [alternativas, setAlternativas] = useState<Alternativa[]>([]);

  // --- Reprogramar: formulario aparte, uno a la vez, por fila ---
  const [reprogramandoId, setReprogramandoId] = useState<string | null>(null);
  const [reprogFecha, setReprogFecha] = useState("");
  const [reprogDuracion, setReprogDuracion] = useState("");
  const [reprogEstado, setReprogEstado] = useState<EstadoEnvio>("reposo");
  const [reprogMensaje, setReprogMensaje] = useState("");
  const [reprogAlternativas, setReprogAlternativas] = useState<Alternativa[]>([]);

  const cargando = estado === "cargando";
  const enModoEdicion = idEditando !== null;

  function token() {
    return localStorage.getItem("token");
  }

  async function cargarProveedores() {
    const res = await fetch(`${API}/api/proveedores`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setProveedores(await res.json());
  }

  async function cargarPedidos() {
    const res = await fetch(`${API}/api/pedidos`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setPedidos(await res.json());
  }

  useEffect(() => {
    cargarProveedores();
    cargarPedidos();
  }, []);

  function limpiarFormulario() {
    setIdEditando(null);
    setNumeroPedido("");
    setProveedorId("");
    setTipoProducto("construcción");
    setFechaHoraProgramada("");
    setDuracionEstimadaMinutos("");
  }

  function iniciarEdicion(pedido: Pedido) {
    setIdEditando(pedido._id);
    setNumeroPedido(pedido.numeroPedido);
    setProveedorId(pedido.proveedorId._id);
    setTipoProducto(pedido.tipoProducto);
    setEstado("reposo");
    setMensaje("");
    setAlternativas([]);
  }

  function usarAlternativa(alt: Alternativa) {
    const minutos = minutosEntre(alt.inicioVentana, alt.finVentana);
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

    try {
      if (enModoEdicion) {
        // Editar solo toca numeroPedido, proveedorId y tipoProducto.
        // La fecha se cambia aparte, con Reprogramar.
        const res = await fetch(`${API}/api/pedidos/${idEditando}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({ numeroPedido, proveedorId, tipoProducto }),
        });

        const data = await res.json();

        if (!res.ok) {
          setEstado("error");
          setMensaje(data.mensaje ?? "No se pudo actualizar el pedido.");
          return;
        }

        setEstado("exito");
        setMensaje("Pedido actualizado correctamente.");
        limpiarFormulario();
        cargarPedidos();
        return;
      }

      const res = await fetch(`${API}/api/pedidos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
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

  async function cancelarPedido(pedido: Pedido) {
    const confirmado = window.confirm(
      `¿Cancelar el pedido ${pedido.numeroPedido}? Esta acción libera su horario.`
    );
    if (!confirmado) return;

    const res = await fetch(`${API}/api/pedidos/${pedido._id}/cancelar`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token()}` },
    });

    if (!res.ok) {
      const data = await res.json();
      window.alert(data.mensaje ?? "No se pudo cancelar el pedido.");
      return;
    }

    cargarPedidos();
  }

  async function inactivarPedido(pedido: Pedido) {
    const confirmado = window.confirm(
      `¿Inactivar el pedido ${pedido.numeroPedido}? Se conserva su estado, pero deja de listarse.`
    );
    if (!confirmado) return;

    const res = await fetch(`${API}/api/pedidos/${pedido._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });

    if (!res.ok) {
      const data = await res.json();
      window.alert(data.mensaje ?? "No se pudo inactivar el pedido.");
      return;
    }

    cargarPedidos();
  }

  function abrirReprogramar(pedido: Pedido) {
    setReprogramandoId(pedido._id);
    setReprogFecha(aDatetimeLocal(pedido.inicioVentana));
    setReprogDuracion(String(minutosEntre(pedido.inicioVentana, pedido.finVentana)));
    setReprogEstado("reposo");
    setReprogMensaje("");
    setReprogAlternativas([]);
  }

  function cerrarReprogramar() {
    setReprogramandoId(null);
    setReprogFecha("");
    setReprogDuracion("");
    setReprogEstado("reposo");
    setReprogMensaje("");
    setReprogAlternativas([]);
  }

  function usarAlternativaReprogramar(alt: Alternativa) {
    setReprogFecha(aDatetimeLocal(alt.inicioVentana));
    setReprogDuracion(String(minutosEntre(alt.inicioVentana, alt.finVentana)));
    setReprogEstado("reposo");
    setReprogMensaje("");
    setReprogAlternativas([]);
  }

  async function enviarReprogramar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!reprogramandoId) return;

    setReprogEstado("cargando");
    setReprogMensaje("");
    setReprogAlternativas([]);

    try {
      const res = await fetch(`${API}/api/pedidos/${reprogramandoId}/reprogramar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          fechaHoraProgramada: new Date(reprogFecha).toISOString(),
          duracionEstimadaMinutos: reprogDuracion ? Number(reprogDuracion) : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        cerrarReprogramar();
        cargarPedidos();
        return;
      }

      if (res.status === 409) {
        setReprogEstado("conflicto");
        setReprogMensaje(data.mensaje);
        setReprogAlternativas(data.alternativas ?? []);
        return;
      }

      setReprogEstado("error");
      setReprogMensaje(data.mensaje ?? "No se pudo reprogramar el pedido.");
    } catch {
      setReprogEstado("error");
      setReprogMensaje("No se pudo conectar con el servidor.");
    }
  }

  return (
    <main className="container py-4">
      <h1 className="h3 mb-4">Agenda de pedidos</h1>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-4">
          <h2 className="h5 mb-3">
            {enModoEdicion ? `Editando ${numeroPedido || "pedido"}` : "Nuevo pedido"}
          </h2>

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

              {!enModoEdicion && (
                <>
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
                </>
              )}
            </div>

            {enModoEdicion && (
              <p className="text-muted small mt-2 mb-0">
                La fecha y hora no se editan aquí: usa &quot;Reprogramar&quot; en la tabla.
              </p>
            )}

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

            <div className="d-flex gap-2 mt-3">
              <button type="submit" className="btn btn-primary" disabled={cargando}>
                {cargando
                  ? "Guardando..."
                  : enModoEdicion
                  ? "Guardar cambios"
                  : "Agendar pedido"}
              </button>
              {enModoEdicion && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={limpiarFormulario}
                  disabled={cargando}
                >
                  Cancelar edición
                </button>
              )}
            </div>
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
              <th>Llegada real</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => {
              const accionable = ESTADOS_ACCIONABLES.includes(p.estado);
              return (
                <Fragment key={p._id}>
                  <tr>
                    <td>{p.numeroPedido}</td>
                    <td>{p.proveedorId?.razonSocial}</td>
                    <td>{p.tipoProducto}</td>
                    <td>
                      {formatearFecha(p.inicioVentana)} – {formatearFecha(p.finVentana)}
                    </td>
                    <td>{p.fechaHoraLlegadaReal ? formatearFecha(p.fechaHoraLlegadaReal) : "—"}</td>
                    <td>
                      <span className={`badge ${claseColorEstado(p.estado)} ${claseTextoEstado(p.estado)}`}>
                        {p.estado}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => iniciarEdicion(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          disabled={!accionable}
                          onClick={() => abrirReprogramar(p)}
                        >
                          Reprogramar
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-warning btn-sm"
                          disabled={!accionable}
                          onClick={() => cancelarPedido(p)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => inactivarPedido(p)}
                        >
                          Inactivar
                        </button>
                      </div>
                    </td>
                  </tr>

                  {reprogramandoId === p._id && (
                    <tr>
                      <td colSpan={7} className="bg-light">
                        <form onSubmit={enviarReprogramar} className="p-3">
                          <div className="row g-3 align-items-end">
                            <div className="col-md-4">
                              <label htmlFor="reprogFecha" className="form-label">
                                Nueva fecha y hora
                              </label>
                              <input
                                id="reprogFecha"
                                type="datetime-local"
                                className="form-control"
                                required
                                value={reprogFecha}
                                onChange={(e) => setReprogFecha(e.target.value)}
                                disabled={reprogEstado === "cargando"}
                              />
                            </div>
                            <div className="col-md-3">
                              <label htmlFor="reprogDuracion" className="form-label">
                                Duración (min)
                              </label>
                              <input
                                id="reprogDuracion"
                                type="number"
                                min={1}
                                className="form-control"
                                value={reprogDuracion}
                                onChange={(e) => setReprogDuracion(e.target.value)}
                                disabled={reprogEstado === "cargando"}
                              />
                            </div>
                            <div className="col-md-5 d-flex gap-2">
                              <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={reprogEstado === "cargando"}
                              >
                                {reprogEstado === "cargando" ? "Guardando..." : "Confirmar"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={cerrarReprogramar}
                              >
                                Cerrar
                              </button>
                            </div>
                          </div>

                          {reprogEstado === "error" && (
                            <div className="alert alert-danger mt-3 py-2 mb-0">{reprogMensaje}</div>
                          )}

                          {reprogEstado === "conflicto" && (
                            <div className="alert alert-warning mt-3 py-2 mb-0">
                              <p className="mb-2">{reprogMensaje}</p>
                              <p className="mb-2 fw-semibold">Horarios alternativos disponibles:</p>
                              <div className="d-flex flex-column gap-2">
                                {reprogAlternativas.map((alt, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className="btn btn-outline-primary btn-sm text-start"
                                    onClick={() => usarAlternativaReprogramar(alt)}
                                  >
                                    {formatearFecha(alt.inicioVentana)} – {formatearFecha(alt.finVentana)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
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
