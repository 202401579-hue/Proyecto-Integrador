"use client";

import { FormEvent, useState } from "react";
import { claseColorEstado, claseTextoEstado, explicarMinutosDeDiferencia } from "@/lib/estados";

const API = process.env.NEXT_PUBLIC_API_URL;

type Resultado = {
  tipo: "exito";
  estado: string;
  proveedor: string;
  explicacion: string;
} | {
  tipo: "error";
  mensaje: string;
};

export default function CasetaDeArribosPage() {
  const [numeroPedido, setNumeroPedido] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCargando(true);
    setResultado(null);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API}/api/llegadas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ numeroPedido: numeroPedido.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResultado({ tipo: "error", mensaje: data.mensaje ?? "No se pudo registrar la llegada." });
        setCargando(false);
        return;
      }

      const estado: string = data.clasificacion.estado;
      const proveedor: string = data.pedido?.proveedorId?.razonSocial ?? "Proveedor no disponible";
      const explicacion = explicarMinutosDeDiferencia(data.clasificacion.minutosDeDiferencia);

      setResultado({ tipo: "exito", estado, proveedor, explicacion });
      setNumeroPedido("");
    } catch {
      setResultado({ tipo: "error", mensaje: "No se pudo conectar con el servidor." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="container-fluid px-3 py-4" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1 className="h4 mb-4 text-center">Caseta de arribos</h1>

      <form onSubmit={manejarEnvio} noValidate>
        <div className="mb-3">
          <label htmlFor="numeroPedido" className="form-label fw-semibold">
            Número de pedido
          </label>
          <input
            id="numeroPedido"
            className="form-control form-control-lg"
            placeholder="OC-2026-0010"
            required
            autoFocus
            value={numeroPedido}
            onChange={(e) => setNumeroPedido(e.target.value)}
            disabled={cargando}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-100"
          disabled={cargando || numeroPedido.trim() === ""}
        >
          {cargando ? "Registrando..." : "Registrar llegada"}
        </button>
      </form>

      {resultado && resultado.tipo === "error" && (
        <div className="alert alert-danger mt-4" role="alert">
          {resultado.mensaje}
        </div>
      )}

      {resultado && resultado.tipo === "exito" && (
        <div className={`card mt-4 ${claseColorEstado(resultado.estado)} ${claseTextoEstado(resultado.estado)}`}>
          <div className="card-body text-center">
            <p className="h3 mb-2">{resultado.estado}</p>
            <p className="mb-1 fw-semibold">{resultado.proveedor}</p>
            <p className="mb-0">{resultado.explicacion}</p>
          </div>
        </div>
      )}
    </main>
  );
}
