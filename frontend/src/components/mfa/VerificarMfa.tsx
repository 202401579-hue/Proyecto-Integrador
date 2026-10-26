"use client";

import { useState } from "react";
import {
  esCodigoAceptable,
  llamarConTokenTemporal,
  normalizarCodigo,
  type RespuestaVerificacion,
} from "@/lib/mfa";

/**
 * Segundo paso del login para quien ya tiene el segundo factor activado.
 *
 * Acepta las dos cosas que acepta el backend: el código de seis dígitos del
 * autenticador y un código de recuperación XXXXX-XXXXX. Este es el único
 * lugar de la aplicación donde se obtiene el token de acceso de ocho horas
 * para un usuario con MFA.
 */

interface VerificarMfaProps {
  tempToken: string;
  /** Llegó el token de acceso: ya hay sesión. */
  onAutenticado: (token: string) => void;
  /** Ya no hay con qué seguir: hay que volver a poner la contraseña. */
  onSesionCaida: (mensaje: string) => void;
}

export default function VerificarMfa({
  tempToken,
  onAutenticado,
  onSesionCaida,
}: VerificarMfaProps) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null);

  // Cuando se entra con un código de recuperación, el backend avisa cuántos
  // quedan. Se retiene el token y se muestra el aviso: si se entrara derecho,
  // el aviso se perdería en la redirección y el usuario nunca sabría que le
  // queda uno.
  const [aviso, setAviso] = useState<{ texto: string; token: string } | null>(null);

  const verificar = async () => {
    setError("");

    if (!esCodigoAceptable(codigo)) {
      setError(
        "Escriba el código de seis dígitos del autenticador, o uno de recuperación con el formato XXXXX-XXXXX."
      );
      return;
    }

    setEnviando(true);
    const resultado = await llamarConTokenTemporal<RespuestaVerificacion>(
      "/api/auth/mfa/verify-login",
      tempToken,
      { codigo: normalizarCodigo(codigo) }
    );
    setEnviando(false);

    if (resultado.estado === "ok") {
      if (resultado.datos.avisoRecuperacion) {
        setAviso({ texto: resultado.datos.avisoRecuperacion, token: resultado.datos.token });
        return;
      }

      onAutenticado(resultado.datos.token);
      return;
    }

    if (resultado.estado === "caida") {
      onSesionCaida(resultado.mensaje);
      return;
    }

    setError(resultado.mensaje);
    setIntentosRestantes(
      resultado.estado === "rechazado" && resultado.intentosRestantes !== undefined
        ? resultado.intentosRestantes
        : null
    );
    setCodigo("");
  };

  if (aviso) {
    return (
      <div>
        <h5 className="mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-key text-warning" />
          Entró con un código de recuperación
        </h5>

        <div className="alert alert-warning py-2">{aviso.texto}</div>
        <p className="small text-muted">
          El código que usó ya no sirve. Si perdió el teléfono, pídale a un
          administrador que le reinicie la verificación en dos pasos.
        </p>

        <button
          type="button"
          className="btn btn-primary w-100"
          onClick={() => onAutenticado(aviso.token)}
        >
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div>
      <h5 className="mb-1 d-flex align-items-center gap-2">
        <i className="bi bi-shield-lock text-primary" />
        Verificación en dos pasos
      </h5>
      <p className="text-muted small mb-3">
        Escriba el código que muestra Google Authenticator.
      </p>

      <div className="mb-3">
        <label htmlFor="codigoVerificacion" className="form-label">
          Código
        </label>
        <input
          id="codigoVerificacion"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={11}
          className="form-control form-control-lg text-center font-monospace"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") verificar();
          }}
          autoFocus
        />
        <div className="form-text">
          También sirve uno de sus códigos de recuperación.
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2">
          {error}
          {intentosRestantes !== null && (
            <div className="small mt-1">
              {intentosRestantes === 0
                ? "No quedan intentos."
                : `Le quedan ${intentosRestantes} intento${
                    intentosRestantes === 1 ? "" : "s"
                  }.`}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary w-100"
        onClick={verificar}
        disabled={enviando}
      >
        {enviando ? "Verificando…" : "Verificar"}
      </button>
    </div>
  );
}
