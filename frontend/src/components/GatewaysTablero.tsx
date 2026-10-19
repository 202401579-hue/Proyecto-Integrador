"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSesion } from "@/components/SesionProvider";
import GatewayCard from "@/components/GatewayCard";
import { obtenerToken } from "@/lib/session";
import { claseColorEstado, claseTextoEstado } from "@/lib/estados";
import { fondoGateway, type Descarga, type Gateway } from "@/lib/estadosGateway";

const API = process.env.NEXT_PUBLIC_API_URL;

const AZUL = "#2f5fb3";
const MARINO = "#1f2a44";

// Un pedido solo se puede descargar cuando el camión ya llegó. Desde el
// Sprint 4, un camión que llega queda EN COLA; los otros tres son pedidos que
// llegaron antes de ese cambio (igual que ESTADOS_ELEGIBLES_DESCARGA en el
// backend). El backend lo valida igual (400): este filtro solo evita ofrecer
// pedidos que van a fallar.
const ESTADOS_ELEGIBLES = ["EN COLA", "ANTICIPADO", "A TIEMPO", "TARDÍO"];

const REFRESCO_MS = 15000;

interface PedidoElegible {
  _id: string;
  numeroPedido: string;
  tipoProducto: string;
  estado: string;
  // Con qué puntualidad llegó (Sprint 4). Los pedidos viejos no la tienen y
  // la llevan en el estado.
  puntualidad?: string | null;
  fechaHoraLlegadaReal?: string | null;
  proveedorId?: { razonSocial: string };
}

// Respuesta de POST /api/descargas/finalizar: si había un camión compatible
// esperando, el backend le inicia la descarga en la misma bahía.
interface Promocion {
  pedido?: { numeroPedido?: string };
  gateway?: { _id?: string; numeroGateway?: number };
}

// Cuánto tiempo se resalta la bahía que recibió un camión automáticamente.
// Mientras dura, su botón "Finalizar" queda bloqueado: así un segundo clic
// apurado no finaliza al camión que el sistema acaba de asignar.
const RESALTE_AUTOMATICO_MS = 10000;

interface Aviso {
  tipo: "success" | "danger" | "info";
  texto: string;
}

async function llamar(ruta: string, opciones: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${obtenerToken()}`,
  };
  if (opciones.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const respuesta = await fetch(`${API}${ruta}`, {
    method: opciones.method ?? "GET",
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });

  const datos: unknown = await respuesta.json().catch(() => null);
  return { ok: respuesta.ok, datos };
}

function mensajeDe(datos: unknown): string {
  const mensaje = (datos as { mensaje?: string } | null)?.mensaje;
  return mensaje ?? "Ocurrió un error inesperado";
}

function idDelGatewayDe(descarga: Descarga): string {
  return typeof descarga.gatewayId === "string" ? descarga.gatewayId : descarga.gatewayId._id;
}

function formatearHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function plural(n: number, singular: string, varios: string) {
  return `${n} ${n === 1 ? singular : varios}`;
}

/** La cola: los pedidos que ya llegaron, del primero en llegar al último. */
function armarCola(todos: PedidoElegible[]): PedidoElegible[] {
  const llegada = (p: PedidoElegible) =>
    p.fechaHoraLlegadaReal ? new Date(p.fechaHoraLlegadaReal).getTime() : Number.MAX_SAFE_INTEGER;
  return todos.filter((p) => ESTADOS_ELEGIBLES.includes(p.estado)).sort((a, b) => llegada(a) - llegada(b));
}

/** Puntualidad para mostrar: el campo nuevo, o el estado en pedidos anteriores al Sprint 4. */
function puntualidadDe(p: PedidoElegible): string {
  return p.puntualidad ?? p.estado;
}

/** Minutos de espera en texto: 12 -> "12 min", 75 -> "1 h 15 min". */
function tiempoEsperando(iso: string | null | undefined, ahora: number): string {
  if (!iso || ahora === 0) return "—";
  const total = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function GatewaysTablero() {
  const { rol } = useSesion();
  const esCoordinador = rol === "Coordinador";

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [descargas, setDescargas] = useState<Descarga[]>([]);
  const [ahora, setAhora] = useState(0);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [gatewayEnAccion, setGatewayEnAccion] = useState<string | null>(null);

  // Bahía que acaba de recibir un camión por la promoción automática de la cola.
  const [asignadoAutomatico, setAsignadoAutomatico] = useState<string | null>(null);
  const temporizadorResalte = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si se sale de la pantalla con el resalte activo, se cancela el temporizador.
  useEffect(() => {
    return () => {
      if (temporizadorResalte.current) clearTimeout(temporizadorResalte.current);
    };
  }, []);

  function resaltarAsignacion(gatewayId: string) {
    if (temporizadorResalte.current) clearTimeout(temporizadorResalte.current);
    setAsignadoAutomatico(gatewayId);
    temporizadorResalte.current = setTimeout(() => setAsignadoAutomatico(null), RESALTE_AUTOMATICO_MS);
  }

  // Panel de camiones para iniciar una descarga: se muestra y oculta con un
  // estado de React, no con el modal de Bootstrap (su JS se carga aparte).
  const [gatewayElegido, setGatewayElegido] = useState<string | null>(null);
  // La cola de espera (solo Coordinador). La usan el panel de la cola y el de
  // iniciar descarga.
  const [pedidos, setPedidos] = useState<PedidoElegible[]>([]);

  const cargarTablero = useCallback(async () => {
    try {
      // El Coordinador además pide los pedidos para armar la cola de espera.
      // El Administrador nunca los pide: GET /api/pedidos le daría 403.
      const [rg, rd, rp] = await Promise.all([
        llamar("/api/gateways"),
        llamar("/api/descargas/activas"),
        esCoordinador ? llamar("/api/pedidos") : Promise.resolve(null),
      ]);

      setAhora(Date.now());

      if (!rg.ok) {
        setAviso({ tipo: "danger", texto: mensajeDe(rg.datos) });
        return;
      }
      setGateways(rg.datos as Gateway[]);

      if (rd.ok) {
        setDescargas(rd.datos as Descarga[]);
      } else {
        setAviso({ tipo: "danger", texto: mensajeDe(rd.datos) });
      }

      if (rp) {
        if (rp.ok) {
          setPedidos(armarCola(rp.datos as PedidoElegible[]));
        } else {
          setAviso({ tipo: "danger", texto: mensajeDe(rp.datos) });
        }
      }
    } catch {
      setAviso({ tipo: "danger", texto: "No se pudo conectar con el servidor" });
    } finally {
      setCargandoInicial(false);
    }
  }, [esCoordinador]);

  // Carga al montar y refresco suave cada 15 s, para que el tablero refleje
  // lo que hicieron otros usuarios sin recargar la página.
  useEffect(() => {
    // La primera carga también va en un callback (no directo en el cuerpo del
    // efecto), como pide la regla react-hooks/set-state-in-effect.
    const primeraCarga = setTimeout(cargarTablero, 0);
    const intervalo = setInterval(cargarTablero, REFRESCO_MS);
    return () => {
      clearTimeout(primeraCarga);
      clearInterval(intervalo);
    };
  }, [cargarTablero]);

  function elegirGateway(gateway: Gateway) {
    setAviso(null);
    setGatewayElegido(gateway._id);
    // La cola ya está cargada; se refresca por si llegó alguien recién.
    cargarTablero();
  }

  async function iniciarDescarga(gateway: Gateway, pedido: PedidoElegible) {
    setGatewayEnAccion(gateway._id);
    setAviso(null);
    try {
      const respuesta = await llamar("/api/descargas/iniciar", {
        method: "POST",
        body: { pedidoId: pedido._id, gatewayId: gateway._id },
      });

      if (!respuesta.ok) {
        setAviso({ tipo: "danger", texto: mensajeDe(respuesta.datos) });
      } else {
        setAviso({
          tipo: "success",
          texto: `Descarga iniciada: ${pedido.numeroPedido} en el gateway ${gateway.numeroGateway}.`,
        });
        setGatewayElegido(null);
      }
      await cargarTablero();
    } catch {
      setAviso({ tipo: "danger", texto: "No se pudo conectar con el servidor" });
    } finally {
      setGatewayEnAccion(null);
    }
  }

  async function finalizarDescarga(gateway: Gateway, descarga: Descarga) {
    setGatewayEnAccion(gateway._id);
    setAviso(null);
    try {
      const respuesta = await llamar("/api/descargas/finalizar", {
        method: "POST",
        body: { descargasId: descarga._id },
      });

      if (!respuesta.ok) {
        setAviso({ tipo: "danger", texto: mensajeDe(respuesta.datos) });
      } else {
        const cuerpo = respuesta.datos as { descarga?: Descarga; promocion?: Promocion | null };
        const duracion = cuerpo.descarga?.duracionMinutos;
        let texto =
          duracion === undefined || duracion === null
            ? `Gateway ${gateway.numeroGateway}: descarga finalizada.`
            : duracion < 1
              ? `Gateway ${gateway.numeroGateway}: descarga finalizada en menos de 1 minuto.`
              : `Gateway ${gateway.numeroGateway}: descarga finalizada en ${duracion} min.`;

        // Si había un camión compatible en la cola, el backend ya le inició
        // la descarga en la misma bahía: la tarjeta sigue roja con él.
        const promocion = cuerpo.promocion;
        if (promocion) {
          const numero = promocion.pedido?.numeroPedido ?? "siguiente de la cola";
          const bahia = promocion.gateway?.numeroGateway ?? gateway.numeroGateway;
          texto += ` Se asignó automáticamente el pedido ${numero} al Gateway ${bahia}.`;
          resaltarAsignacion(promocion.gateway?._id ?? gateway._id);
        }
        setAviso({ tipo: promocion ? "info" : "success", texto });
      }
      await cargarTablero();
    } catch {
      setAviso({ tipo: "danger", texto: "No se pudo conectar con el servidor" });
    } finally {
      setGatewayEnAccion(null);
    }
  }

  async function cambiarEstado(gateway: Gateway, estado: "LIBRE" | "FUERA DE SERVICIO") {
    setGatewayEnAccion(gateway._id);
    setAviso(null);
    try {
      const respuesta = await llamar(`/api/gateways/${gateway._id}`, {
        method: "PUT",
        body: { estado },
      });

      if (!respuesta.ok) {
        setAviso({ tipo: "danger", texto: mensajeDe(respuesta.datos) });
      } else {
        setAviso({
          tipo: "success",
          texto:
            estado === "FUERA DE SERVICIO"
              ? `Gateway ${gateway.numeroGateway} puesto fuera de servicio.`
              : `Gateway ${gateway.numeroGateway} habilitado de nuevo.`,
        });
      }
      await cargarTablero();
    } catch {
      setAviso({ tipo: "danger", texto: "No se pudo conectar con el servidor" });
    } finally {
      setGatewayEnAccion(null);
    }
  }

  const elegido = gateways.find((g) => g._id === gatewayElegido) ?? null;

  const libres = gateways.filter((g) => g.estado === "LIBRE").length;
  const ocupados = gateways.filter((g) => g.estado === "OCUPADO").length;
  const fueraDeServicio = gateways.filter((g) => g.estado === "FUERA DE SERVICIO").length;

  return (
    <div className="d-flex flex-column gap-4">
      {/* Encabezado con resumen y leyenda */}
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <h1 className="h3 mb-1">
            {esCoordinador ? "Andén de descarga" : "Mantenimiento de gateways"}
          </h1>
          <p className="mb-0" style={{ color: "#5b6472" }}>
            {cargandoInicial
              ? "Cargando bahías..."
              : `${plural(libres, "bahía libre", "bahías libres")} · ${plural(
                  ocupados,
                  "descargando",
                  "descargando"
                )} · ${plural(fueraDeServicio, "en mantenimiento", "en mantenimiento")}`}
          </p>
        </div>

        <div className="d-flex flex-wrap gap-3 small">
          {(["LIBRE", "OCUPADO", "FUERA DE SERVICIO"] as const).map((estado) => (
            <span key={estado} className="d-inline-flex align-items-center gap-2">
              <span
                className="d-inline-block rounded-1"
                style={{ width: 12, height: 12, background: fondoGateway(estado) }}
              />
              {estado === "LIBRE" ? "Libre" : estado === "OCUPADO" ? "Ocupado" : "Fuera de servicio"}
            </span>
          ))}
        </div>
      </div>

      {aviso && (
        <div
          className={`alert alert-${aviso.tipo} d-flex justify-content-between align-items-center py-2 mb-0`}
          role="alert"
        >
          <span>{aviso.texto}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Cerrar aviso"
            onClick={() => setAviso(null)}
          />
        </div>
      )}

      {/* El andén: las cinco puertas sobre el patio de maniobras */}
      <section
        className="bg-white pt-4 px-4"
        style={{ borderRadius: 16, boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 6px 16px rgba(16,24,40,0.07)" }}
      >
        {cargandoInicial ? (
          <div className="text-center text-muted py-5">
            <div className="spinner-border spinner-border-sm me-2" role="status" />
            Cargando gateways...
          </div>
        ) : (
          <div className="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-3 align-items-end">
            {gateways.map((gateway) => {
              const descarga = descargas.find((d) => idDelGatewayDe(d) === gateway._id);
              return (
                <div className="col" key={gateway._id}>
                  <GatewayCard
                    gateway={gateway}
                    descarga={descarga}
                    rol={rol}
                    ahora={ahora}
                    ocupadaEnAccion={gatewayEnAccion === gateway._id}
                    seleccionada={gatewayElegido === gateway._id}
                    asignadoAutomatico={asignadoAutomatico === gateway._id}
                    onIniciar={() => elegirGateway(gateway)}
                    onCancelarSeleccion={() => setGatewayElegido(null)}
                    onFinalizar={() => descarga && finalizarDescarga(gateway, descarga)}
                    onCambiarEstado={(estado) => cambiarEstado(gateway, estado)}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div
          className="text-center small mt-3"
          style={{
            margin: "0 -1.5rem",
            background: MARINO,
            color: "#c9d1de",
            letterSpacing: "0.2em",
            padding: 8,
            borderRadius: "0 0 16px 16px",
          }}
        >
          PATIO DE MANIOBRAS
        </div>
      </section>

      {/* Camiones que pueden entrar a la bahía elegida (solo Coordinador) */}
      {esCoordinador && elegido && (
        <section className="d-flex flex-column gap-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span className="fw-bold">
              Camiones que pueden entrar al gateway {elegido.numeroGateway}
              <span className="fw-normal" style={{ color: "#5b6472" }}>
                {" "}
                · carga {elegido.tipoCargaPermitida}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setGatewayElegido(null)}
            >
              Cancelar
            </button>
          </div>

          {pedidos.length === 0 ? (
            <div className="bg-white rounded-3 p-3 text-muted">
              No hay camiones en el patio. Un pedido aparece acá cuando el operador registra su
              llegada en la caseta.
            </div>
          ) : (
            <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
              {pedidos.map((pedido) => {
                const compatible = pedido.tipoProducto === elegido.tipoCargaPermitida;
                const restriccion =
                  pedido.tipoProducto === "construcción"
                    ? "Solo puede entrar al gateway 5"
                    : "Solo puede entrar a los gateways 1 a 4";

                return (
                  <div className="col" key={pedido._id}>
                    <div
                      className="h-100 rounded-3 p-3 d-flex flex-column gap-2"
                      style={
                        compatible
                          ? { background: "#ffffff", boxShadow: "0 1px 2px rgba(16,24,40,0.06)" }
                          : { background: "#eef1f4", color: "#6b7686" }
                      }
                    >
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <span className="fw-bold text-truncate" title={pedido.numeroPedido}>
                          {pedido.numeroPedido}
                        </span>
                        <span
                          className={`badge ${claseColorEstado(puntualidadDe(pedido))} ${claseTextoEstado(
                            puntualidadDe(pedido)
                          )}`}
                        >
                          {puntualidadDe(pedido)}
                        </span>
                      </div>
                      <span className="small" style={compatible ? { color: "#5b6472" } : undefined}>
                        {pedido.proveedorId?.razonSocial} · {pedido.tipoProducto}
                        {pedido.fechaHoraLlegadaReal
                          ? ` · llegó ${formatearHora(pedido.fechaHoraLlegadaReal)}`
                          : ""}
                      </span>

                      {compatible ? (
                        <button
                          type="button"
                          className="btn btn-sm fw-semibold mt-auto"
                          style={{ background: AZUL, color: "#ffffff", borderColor: AZUL, minHeight: 44 }}
                          disabled={gatewayEnAccion !== null}
                          onClick={() => iniciarDescarga(elegido, pedido)}
                        >
                          {gatewayEnAccion === elegido._id
                            ? "Asignando..."
                            : `Mandar al gateway ${elegido.numeroGateway}`}
                        </button>
                      ) : (
                        <div
                          className="small text-center mt-auto d-flex align-items-center justify-content-center"
                          style={{ border: "1px dashed #adb5bd", borderRadius: 8, minHeight: 44 }}
                        >
                          {restriccion}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Cola de espera (solo Coordinador): primero en llegar, primero en descargar */}
      {esCoordinador && !cargandoInicial && (
        <section
          className="bg-white p-3 p-md-4"
          style={{ borderRadius: 16, boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 6px 16px rgba(16,24,40,0.07)" }}
        >
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <div>
              <h2 className="h5 fw-bold mb-1 d-flex align-items-center gap-2" style={{ color: MARINO }}>
                Cola de espera
                <span className="badge rounded-pill" style={{ background: MARINO, fontSize: 12 }}>
                  {pedidos.length}
                </span>
              </h2>
              <p className="small mb-0" style={{ color: "#5b6472" }}>
                Se atienden por orden de llegada, respetando el tipo de carga de cada bahía. Al finalizar
                una descarga, el sistema asigna solo al primer camión compatible.
              </p>
            </div>
          </div>

          {pedidos.length === 0 ? (
            <div className="rounded-3 p-3 small text-center" style={{ background: "#f4f6f9", color: "#5b6472" }}>
              No hay camiones esperando. Un pedido entra a la cola cuando el operador registra su llegada en
              la caseta.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr className="small text-uppercase" style={{ color: "#5b6472", letterSpacing: "0.04em" }}>
                    <th scope="col" style={{ width: 48 }}>#</th>
                    <th scope="col">Pedido</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Carga</th>
                    <th scope="col">Puntualidad</th>
                    <th scope="col" className="text-end">Esperando</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((pedido, indice) => {
                    const esConstruccion = pedido.tipoProducto === "construcción";
                    return (
                      <tr key={pedido._id}>
                        <td className="fw-bold" style={{ color: MARINO }}>{indice + 1}</td>
                        <td className="fw-semibold text-nowrap">{pedido.numeroPedido}</td>
                        <td>{pedido.proveedorId?.razonSocial}</td>
                        <td className="text-nowrap">
                          <span
                            className="badge fw-semibold"
                            style={
                              esConstruccion
                                ? { background: "#e8edf7", color: MARINO }
                                : { background: "#eef1f4", color: "#4a5361" }
                            }
                          >
                            {esConstruccion ? "Construcción · gateway 5" : "General · gateways 1 a 4"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${claseColorEstado(puntualidadDe(pedido))} ${claseTextoEstado(
                              puntualidadDe(pedido)
                            )}`}
                          >
                            {puntualidadDe(pedido)}
                          </span>
                        </td>
                        <td className="text-end text-nowrap fw-semibold" style={{ color: MARINO }}>
                          {tiempoEsperando(pedido.fechaHoraLlegadaReal, ahora)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
