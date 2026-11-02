"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import CampoCodigo from "@/components/mfa/CampoCodigo";
import CodigosRecuperacion from "@/components/mfa/CodigosRecuperacion";
import { obtenerTokenTemporal } from "@/lib/mfaTemp";
import {
  llamarConTokenTemporal,
  type RespuestaActivacion,
  type RespuestaSetup,
} from "@/lib/mfa";

/**
 * Enrolamiento en Google Authenticator (Sprint 5).
 *
 * Se abre cuando el login responde `mfaSetupRequired`: un administrador le
 * exigió la verificación en dos pasos a este usuario y el usuario todavía no
 * la configuró. Mientras dura, el usuario no tiene sesión; lo único que tiene
 * es el token temporal de cinco minutos.
 *
 * Se muestra con un estado de React y no con el modal de Bootstrap: el JS de
 * Bootstrap no está cargado en el login (el layout privado es el que lo
 * incluye), y además un modal controlado por una librería externa podría
 * cerrarse con Escape o con un clic afuera, que es lo último que se quiere en
 * la pantalla donde se entregan los códigos de recuperación.
 *
 * El QR se dibuja en el navegador a partir del otpauthUrl. No se usa ningún
 * generador de QR por URL: eso mandaría el secreto del segundo factor a un
 * servidor ajeno, que es exactamente lo que el segundo factor viene a
 * proteger.
 */

interface MfaSetupModalProps {
  /** Se muestra para cargar la cuenta a mano en la aplicación. */
  correo: string;
  /** El usuario guardó sus códigos: hay que ir a pedirle el primer código. */
  onConfigurado: () => void;
  /** Ya no hay con qué seguir: hay que volver a poner la contraseña. */
  onSesionCaida: (mensaje: string) => void;
  onCancelar: () => void;
}

export default function MfaSetupModal({
  correo,
  onConfigurado,
  onSesionCaida,
  onCancelar,
}: MfaSetupModalProps) {
  const [setup, setSetup] = useState<RespuestaSetup | null>(null);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);

  // Cada POST a /api/mfa/setup genera un secreto nuevo y descarta el
  // anterior. En desarrollo React monta los efectos dos veces, así que sin
  // este candado se pedirían dos secretos y el QR en pantalla podría no ser
  // el que quedó guardado: el usuario escanearía uno que ya no vale.
  const yaPedido = useRef(false);

  useEffect(() => {
    if (yaPedido.current) return;
    yaPedido.current = true;

    const pedirSecreto = async () => {
      const temporal = obtenerTokenTemporal();

      if (!temporal) {
        onSesionCaida("Vuelva a iniciar sesión para configurar la verificación.");
        return;
      }

      const resultado = await llamarConTokenTemporal<RespuestaSetup>(
        "/api/mfa/setup",
        temporal
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
  }, [onSesionCaida]);

  const activar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (codigo.length !== 6) {
      setError("El código del autenticador tiene seis dígitos.");
      return;
    }

    const temporal = obtenerTokenTemporal();
    if (!temporal) {
      onSesionCaida("Vuelva a iniciar sesión para configurar la verificación.");
      return;
    }

    setEnviando(true);
    const resultado = await llamarConTokenTemporal<RespuestaActivacion>(
      "/api/mfa/enable",
      temporal,
      { codigo }
    );
    setEnviando(false);

    if (resultado.estado === "ok") {
      setCodigos(resultado.datos.codigosDeRecuperacion);
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

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title h6 d-flex align-items-center gap-2">
              <i className="bi bi-shield-lock text-primary" />
              {codigos ? "Códigos de recuperación" : "Configure la verificación en dos pasos"}
            </h5>
            {/* Mientras están los códigos a la vista no hay forma de cerrar:
                la única salida es "Continuar", y recién después de marcar que
                los guardó. */}
            {!codigos && (
              <button
                type="button"
                className="btn-close"
                aria-label="Cerrar"
                onClick={onCancelar}
              />
            )}
          </div>

          <div className="modal-body p-4">
            {codigos ? (
              <CodigosRecuperacion codigos={codigos} onContinuar={onConfigurado} />
            ) : (
              <>
                <p className="text-muted small mb-3">
                  Su cuenta la tiene como obligatoria. Escanee el código con
                  Google Authenticator y escriba el número que aparece en la
                  aplicación.
                </p>

                {!setup && !error && <p className="text-muted mb-0">Generando el código…</p>}

                {setup && (
                  <>
                    <div className="text-center mb-3">
                      <div className="d-inline-block bg-white border rounded p-3">
                        <QRCodeSVG value={setup.otpauthUrl} size={180} level="M" />
                      </div>
                    </div>

                    <div className="mb-3">
                      <label htmlFor="secretoBase32" className="form-label small text-muted">
                        ¿No puede escanearlo? Cargue la cuenta a mano con esta
                        clave y el correo <strong>{correo}</strong>:
                      </label>
                      <code
                        id="secretoBase32"
                        className="d-block bg-light border rounded p-2 text-break"
                      >
                        {setup.secretoBase32}
                      </code>
                    </div>

                    <form onSubmit={activar}>
                      <CampoCodigo
                        valor={codigo}
                        onChange={setCodigo}
                        id="codigoActivacion"
                        etiqueta="Código de seis dígitos"
                        deshabilitado={enviando}
                        autoFocus
                      />

                      {error && (
                        <div className="alert alert-danger py-2">
                          {error}
                          {intentosRestantes !== null && (
                            <div className="small mt-1">
                              {intentosRestantes === 0
                                ? "No quedan intentos."
                                : `Le ${intentosRestantes === 1 ? "queda" : "quedan"} ${
                                    intentosRestantes
                                  } ${intentosRestantes === 1 ? "intento" : "intentos"}.`}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="btn btn-primary w-100"
                        disabled={enviando}
                      >
                        {enviando ? "Verificando..." : "Activar"}
                      </button>
                    </form>
                  </>
                )}

                {!setup && error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
