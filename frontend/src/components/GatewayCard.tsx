"use client";

import type { CSSProperties } from "react";
import type { Rol } from "@/lib/session";
import { fondoGateway, type Descarga, type Gateway } from "@/lib/estadosGateway";

const AZUL = "#2f5fb3";
const ROJO_OSCURO = "#9b2c25";
const PIZARRA = "#4a5361";

interface GatewayCardProps {
  gateway: Gateway;
  descarga?: Descarga;
  rol: Rol;
  // Hora actual en ms, la pasa el tablero en cada refresco: con ella se
  // calcula cuánto lleva la descarga (solo para mostrar; la duración
  // oficial la calcula el backend al finalizar).
  ahora: number;
  // Hay una petición en curso sobre esta puerta: se bloquean los botones.
  ocupadaEnAccion: boolean;
  seleccionada: boolean;
  onIniciar: () => void;
  onCancelarSeleccion: () => void;
  onFinalizar: () => void;
  onCambiarEstado: (estado: "LIBRE" | "FUERA DE SERVICIO") => void;
}

function formatearHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function minutosDesde(iso: string, ahora: number) {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
}

function estiloBoton(fondo: string, texto: string, borde: string): CSSProperties {
  return { background: fondo, color: texto, borderColor: borde, minHeight: 44 };
}

function Camion() {
  return (
    <svg width="64" height="48" viewBox="0 0 64 48" fill="none" stroke="#ffffff" strokeWidth="2.5" aria-hidden="true">
      <rect x="3" y="8" width="36" height="26" rx="2" />
      <path d="M39 16h12l9 10v8H39z" />
      <circle cx="14" cy="39" r="5" />
      <circle cx="50" cy="39" r="5" />
    </svg>
  );
}

function Llave() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
    </svg>
  );
}

function Disponible() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

function FlechaEntrada() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" aria-hidden="true">
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

export default function GatewayCard({
  gateway,
  descarga,
  rol,
  ahora,
  ocupadaEnAccion,
  seleccionada,
  onIniciar,
  onCancelarSeleccion,
  onFinalizar,
  onCambiarEstado,
}: GatewayCardProps) {
  const esConstruccion = gateway.tipoCargaPermitida === "construcción";
  const esCoordinador = rol === "Coordinador";
  const esAdministrador = rol === "Administrador";
  const { estado } = gateway;


  return (
    <div className="d-flex flex-column gap-2 h-100">
      {/* La puerta del andén */}
      <div
        className="text-white d-flex flex-column justify-content-between p-3"
        style={{
          height: 270,
          borderRadius: "14px 14px 0 0",
          background: fondoGateway(estado),
          boxShadow: seleccionada ? `0 0 0 4px #ffffff, 0 0 0 7px ${AZUL}` : "none",
          transition: "box-shadow 0.15s ease",
        }}
      >
        <span className="small fw-bold" style={{ letterSpacing: "0.06em" }}>
          {estado}
        </span>

        {estado === "OCUPADO" && (
          <div className="d-flex flex-column align-items-center gap-1 text-center" style={{ minWidth: 0 }}>
            <Camion />
            {descarga ? (
              <>
                <span className="small fw-bold w-100 text-break">
                  {descarga.pedidoId.numeroPedido}
                </span>
                <span className="small w-100" style={{ lineHeight: 1.25 }}>
                  {descarga.pedidoId.proveedorId?.razonSocial}
                </span>
                <span className="small fw-semibold">
                  Desde {formatearHora(descarga.fechaHoraInicio)} · lleva{" "}
                  {minutosDesde(descarga.fechaHoraInicio, ahora)} min
                </span>
              </>
            ) : (
              <span className="small">Descarga en curso</span>
            )}
          </div>
        )}

        {estado === "LIBRE" && (
          <div className="d-flex flex-column align-items-center gap-1 text-center">
            {seleccionada ? <FlechaEntrada /> : <Disponible />}
            <span className="small fw-semibold">
              {seleccionada ? "Seleccionada" : "Disponible"}
            </span>
          </div>
        )}

        {estado === "FUERA DE SERVICIO" && (
          <div className="d-flex flex-column align-items-center gap-1">
            <Llave />
            {gateway.fechaActualizacion && (
              <span
                className="small px-2 rounded"
                style={{ background: "rgba(0,0,0,0.35)" }}
                title={gateway.usuarioActualizacion ? `Por ${gateway.usuarioActualizacion}` : undefined}
              >
                desde {formatearHora(gateway.fechaActualizacion)}
              </span>
            )}
          </div>
        )}

        <div className="d-flex justify-content-between align-items-end">
          <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{gateway.numeroGateway}</span>
          {esConstruccion ? (
            <span
              className="fw-bold rounded text-center"
              style={{ background: "#e8edf7", color: "#1f2a44", fontSize: 11, padding: "3px 7px", lineHeight: 1.2 }}
            >
              SOLO
              <br />
              CONSTRUCCIÓN
            </span>
          ) : (
            <span
              className="fw-bold rounded"
              style={{ background: "rgba(255,255,255,0.18)", fontSize: 11, padding: "3px 7px" }}
            >
              {gateway.tipoCargaPermitida.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Acción debajo de la puerta, según rol y estado */}
      {esCoordinador && estado === "LIBRE" && !seleccionada && (
        <button
          type="button"
          className="btn btn-sm fw-semibold"
          style={estiloBoton("#ffffff", AZUL, AZUL)}
          onClick={onIniciar}
          disabled={ocupadaEnAccion}
        >
          Iniciar descarga
        </button>
      )}

      {esCoordinador && estado === "LIBRE" && seleccionada && (
        <button
          type="button"
          className="btn btn-sm fw-semibold"
          style={estiloBoton(AZUL, "#ffffff", AZUL)}
          onClick={onCancelarSeleccion}
          disabled={ocupadaEnAccion}
        >
          Cancelar selección
        </button>
      )}

      {esCoordinador && estado === "OCUPADO" && descarga && (
        <button
          type="button"
          className="btn btn-sm fw-semibold"
          style={estiloBoton("#ffffff", ROJO_OSCURO, "#c8463d")}
          onClick={onFinalizar}
          disabled={ocupadaEnAccion}
        >
          {ocupadaEnAccion ? "Finalizando..." : "Finalizar descarga"}
        </button>
      )}

      {esAdministrador && estado === "LIBRE" && (
        <button
          type="button"
          className="btn btn-sm fw-semibold"
          style={estiloBoton("#ffffff", PIZARRA, "#6b7686")}
          onClick={() => onCambiarEstado("FUERA DE SERVICIO")}
          disabled={ocupadaEnAccion}
        >
          Poner fuera de servicio
        </button>
      )}

      {esAdministrador && estado === "FUERA DE SERVICIO" && (
        <button
          type="button"
          className="btn btn-sm fw-semibold"
          style={estiloBoton("#ffffff", AZUL, AZUL)}
          onClick={() => onCambiarEstado("LIBRE")}
          disabled={ocupadaEnAccion}
        >
          Volver a habilitar
        </button>
      )}

      {((esCoordinador && estado === "FUERA DE SERVICIO") ||
        (esAdministrador && estado === "OCUPADO")) && (
        <div
          className="small text-center d-flex align-items-center justify-content-center"
          style={{ color: "#6b7686", minHeight: 44 }}
        >
          No disponible
        </div>
      )}
    </div>
  );
}
