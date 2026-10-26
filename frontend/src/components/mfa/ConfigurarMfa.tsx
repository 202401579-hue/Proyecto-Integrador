"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  esCodigoTotp,
  llamarConTokenTemporal,
  type RespuestaActivacion,
  type RespuestaSetup,
} from "@/lib/mfa";

/**
 * Primer paso del alta del segundo factor: mostrar el QR, recibir el primer
 * código del autenticador y entregar los códigos de recuperación.
 *
 * Se llega acá cuando el login respondió `mfaSetupRequired`, o sea cuando un
 * administrador le exigió la verificación en dos pasos a este usuario y el
 * usuario todavía no la configuró. Mientras dura esta pantalla el usuario no
 * tiene sesión: lo único que tiene es el token temporal de cinco minutos.
 *
 * El QR se dibuja en el navegador a partir del otpauthUrl que manda el
 * backend. No se usa ningún generador de QR por URL: eso mandaría el secreto
 * del segundo factor a un servidor ajeno, que es exactamente lo que el
 * segundo factor viene a proteger.
 */

interface ConfigurarMfaProps {
  tempToken: string;
  correo: string;
  /** El usuario ya guardó sus códigos: toca pedirle el código y entrar. */
  onConfigurado: () => void;
  /** Ya no hay con qué seguir: hay que volver a poner la contraseña. */
  onSesionCaida: (mensaje: string) => void;
}

export default function ConfigurarMfa({
  tempToken,
  correo,
  onConfigurado,
  onSesionCaida,
}: ConfigurarMfaProps) {
  const [setup, setSetup] = useState<RespuestaSetup | null>(null);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null);
  const [codigosDeRecuperacion, setCodigosDeRecuperacion] = useState<string[] | null>(null);
  const [guardados, setGuardados] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Cada llamada a /api/mfa/setup genera un secreto nuevo y descarta el
  // anterior. En desarrollo React monta los efectos dos veces, así que sin
  // este candado se pedirían dos secretos y el QR en pantalla podría no ser
  // el que quedó guardado.
  const yaPedido = useRef(false);

  useEffect(() => {
    if (yaPedido.current) return;
    yaPedido.current = true;

    const pedirSecreto = async () => {
      const resultado = await llamarConTokenTemporal<RespuestaSetup>(
        "/api/mfa/setup",
        tempToken
      );

      if (resultado.estado === "ok") {
        setSetup(resultado.datos);
        return;
      }

      if (resultado.estado === "caida") {
        onSesionCaida(resultado.mensaje);
        return;
      }

      setError(resultado.mensaje);
    };

    pedirSecreto();
  }, [tempToken, onSesionCaida]);

  const activar = async () => {
    setError("");

    if (!esCodigoTotp(codigo)) {
      setError("El código del autenticador tiene seis dígitos.");
      return;
    }

    setEnviando(true);
    const resultado = await llamarConTokenTemporal<RespuestaActivacion>(
      "/api/mfa/enable",
      tempToken,
      { codigo: codigo.trim() }
    );
    setEnviando(false);

    if (resultado.estado === "ok") {
      setCodigosDeRecuperacion(resultado.datos.codigosDeRecuperacion);
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

  const copiarCodigos = async () => {
    if (!codigosDeRecuperacion) return;

    try {
      await navigator.clipboard.writeText(codigosDeRecuperacion.join("\n"));
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles no se puede hacer nada: los códigos
      // están a la vista para copiarlos a mano.
      setCopiado(false);
    }
  };

  // Segunda pantalla: los ocho códigos de recuperación. Se muestran una sola
  // vez, porque en la base quedan solo sus hashes.
  if (codigosDeRecuperacion) {
    return (
      <div>
        <h5 className="mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-shield-check text-success" />
          Verificación en dos pasos activada
        </h5>

        <div className="alert alert-warning py-2">
          <strong>Guarde estos códigos ahora.</strong> Es la única vez que se
          muestran. Cada uno sirve una sola vez para entrar si pierde el
          teléfono.
        </div>

        <div className="row row-cols-2 g-2 mb-3">
          {codigosDeRecuperacion.map((item) => (
            <div className="col" key={item}>
              <div className="border rounded bg-light text-center font-monospace py-2">
                {item}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary btn-sm w-100 mb-3"
          onClick={copiarCodigos}
        >
          <i className={`bi ${copiado ? "bi-check2" : "bi-clipboard"} me-1`} />
          {copiado ? "Copiados" : "Copiar los ocho códigos"}
        </button>

        <div className="form-check mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="codigosGuardados"
            checked={guardados}
            onChange={(e) => setGuardados(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="codigosGuardados">
            Ya guardé los códigos en un lugar seguro
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary w-100"
          onClick={onConfigurado}
          disabled={!guardados}
        >
          Continuar
        </button>
      </div>
    );
  }

  // Primera pantalla: el QR y el primer código.
  return (
    <div>
      <h5 className="mb-1 d-flex align-items-center gap-2">
        <i className="bi bi-shield-lock text-primary" />
        Configure la verificación en dos pasos
      </h5>
      <p className="text-muted small mb-3">
        Su cuenta la tiene como obligatoria. Escanee el código con Google
        Authenticator y escriba el número que aparece en la aplicación.
      </p>

      {!setup && !error && <p className="text-muted mb-0">Generando el código…</p>}

      {setup && (
        <>
          <div className="text-center mb-3">
            <div className="d-inline-block bg-white border rounded p-3">
              <QRCodeSVG value={setup.otpauthUrl} size={180} level="M" />
            </div>
          </div>

          <details className="mb-3">
            <summary className="small text-muted" style={{ cursor: "pointer" }}>
              No puedo escanear el código
            </summary>
            <p className="small text-muted mb-1 mt-2">
              Agregue la cuenta a mano en la aplicación, con esta clave y el
              correo <strong>{correo}</strong>:
            </p>
            <code className="d-block bg-light border rounded p-2 text-break">
              {setup.secretoBase32}
            </code>
          </details>

          <div className="mb-3">
            <label htmlFor="codigoMfa" className="form-label">
              Código de seis dígitos
            </label>
            <input
              id="codigoMfa"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="form-control form-control-lg text-center font-monospace"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") activar();
              }}
              autoFocus
            />
          </div>
        </>
      )}

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

      {setup && (
        <button
          type="button"
          className="btn btn-primary w-100"
          onClick={activar}
          disabled={enviando}
        >
          {enviando ? "Verificando…" : "Activar"}
        </button>
      )}
    </div>
  );
}
