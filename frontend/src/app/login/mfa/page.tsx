"use client";

import { useEffect, useRef, useState, useSyncExternalStore, FormEvent } from "react";
import { useRouter } from "next/navigation";
import CampoCodigo from "@/components/mfa/CampoCodigo";
import { guardarToken, obtenerRutaPorRol, sesionDesdeToken } from "@/lib/session";
import { borrarTokenTemporal, obtenerTokenTemporal } from "@/lib/mfaTemp";
import {
  esCodigoDeRecuperacion,
  llamarConTokenTemporal,
  normalizarCodigo,
  type RespuestaVerificacion,
} from "@/lib/mfa";

/**
 * Segundo paso del login (Sprint 5).
 *
 * Es una ruta PÚBLICA, fuera de (privado): quien llega acá todavía no tiene
 * sesión, solo el token temporal de cinco minutos. Si estuviera dentro del
 * grupo privado, el layout la rebotaría al login antes de poder mostrarla.
 *
 * Acepta las dos cosas que acepta el backend: el código de seis dígitos del
 * autenticador y uno de los ocho códigos de recuperación.
 */

const sinSuscripcion = () => () => {};

export default function PaginaVerificarMfa() {
  const router = useRouter();

  // Mismo recurso que usa (privado)/layout.tsx: en el servidor devuelve
  // false, y recién en el navegador pasa a true. Sin esto, el prerenderizado
  // del build vería que no hay token temporal (no existe sessionStorage) y
  // la página se escribiría como un redirect al login.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const temporal = montado ? obtenerTokenTemporal() : null;

  const [codigo, setCodigo] = useState("");
  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Una vez que se decidió a dónde ir, borrar el token temporal no tiene que
  // disparar el rebote de abajo. Sin este testigo, el camino feliz hace dos
  // navegaciones que compiten: la de la zona privada y la del login.
  const navegando = useRef(false);

  const salirA = (ruta: string) => {
    navegando.current = true;
    router.replace(ruta);
  };

  // Sin token temporal no hay nada que verificar: se llegó por la URL, se
  // recargó después de usarlo, o venció la pestaña.
  useEffect(() => {
    if (!montado || temporal || navegando.current) return;

    navegando.current = true;
    router.replace("/login");
  }, [montado, temporal, router]);

  if (!montado || !temporal) {
    return null;
  }

  const verificar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const limpio = modoRecuperacion ? normalizarCodigo(codigo) : codigo;

    if (modoRecuperacion ? !esCodigoDeRecuperacion(limpio) : limpio.length !== 6) {
      setError(
        modoRecuperacion
          ? "Un código de recuperación tiene el formato XXXXX-XXXXX."
          : "El código del autenticador tiene seis dígitos."
      );
      return;
    }

    setEnviando(true);
    const resultado = await llamarConTokenTemporal<RespuestaVerificacion>(
      "/api/auth/mfa/verify-login",
      temporal,
      { codigo: limpio }
    );
    setEnviando(false);

    if (resultado.estado === "ok") {
      // Se lee el token antes de guardarlo: así se confirma que es legible y
      // vigente, y de paso sale el rol para saber a qué sección mandar al
      // usuario. El punto 6 le agrega a sesionDesdeToken la exigencia de que
      // el token sea de tipo ACCESS, y esta comprobación la hereda.
      const sesion = sesionDesdeToken(resultado.datos.token);

      if (!sesion) {
        setError("El servidor no devolvió una sesión válida. Vuelva a iniciar sesión.");
        return;
      }

      guardarToken(resultado.datos.token);
      borrarTokenTemporal();
      salirA(obtenerRutaPorRol(sesion.rol));
      return;
    }

    // 429 (se agotaron los cinco intentos) y 401 sin intentosRestantes (el
    // token temporal venció o ya no vale): en los dos casos no queda nada que
    // hacer en esta pantalla, así que se borra el temporal y se vuelve al
    // login con el motivo.
    if (resultado.estado === "caida") {
      borrarTokenTemporal();
      const aviso =
        resultado.http === 429
          ? "Demasiados intentos. Vuelva a iniciar sesión."
          : resultado.mensaje;
      salirA(`/login?aviso=${encodeURIComponent(aviso)}`);
      return;
    }

    if (resultado.estado === "rechazado" && resultado.intentosRestantes !== undefined) {
      const quedan = resultado.intentosRestantes;
      setError(
        `Código incorrecto. Le ${quedan === 1 ? "queda" : "quedan"} ${quedan} ` +
          `${quedan === 1 ? "intento" : "intentos"}.`
      );
    } else {
      // Formato rechazado por el backend, o un problema de red: ninguno de
      // los dos gasta un intento.
      setError(resultado.mensaje);
    }

    setCodigo("");
  };

  const cancelar = () => {
    borrarTokenTemporal();
    salirA("/login");
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div className="card shadow p-4" style={{ width: "100%", maxWidth: "420px" }}>
        <h3 className="text-center h5 mb-1 d-flex align-items-center justify-content-center gap-2">
          <i className="bi bi-shield-lock text-primary" />
          Verificación en dos pasos
        </h3>
        <p className="text-muted small text-center mb-4">
          {modoRecuperacion
            ? "Escriba uno de los códigos de recuperación que guardó al activar la verificación."
            : "Escriba el código que muestra Google Authenticator."}
        </p>

        <form onSubmit={verificar}>
          {modoRecuperacion ? (
            <div className="mb-3">
              <label htmlFor="codigoRecuperacion" className="form-label">
                Código de recuperación
              </label>
              <input
                id="codigoRecuperacion"
                type="text"
                autoComplete="off"
                maxLength={11}
                className="form-control form-control-lg text-center font-monospace text-uppercase"
                placeholder="XXXXX-XXXXX"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoFocus
              />
              <div className="form-text">Cada código sirve una sola vez.</div>
            </div>
          ) : (
            <CampoCodigo
              valor={codigo}
              onChange={setCodigo}
              id="codigoAutenticador"
              etiqueta="Código de seis dígitos"
              deshabilitado={enviando}
              autoFocus
            />
          )}

          {error && <div className="alert alert-danger py-2">{error}</div>}

          <button type="submit" className="btn btn-primary w-100" disabled={enviando}>
            {enviando ? "Verificando..." : "Verificar"}
          </button>
        </form>

        <div className="text-center mt-3">
          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={() => {
              setModoRecuperacion((v) => !v);
              setCodigo("");
              setError("");
            }}
          >
            {modoRecuperacion
              ? "Usar el código del autenticador"
              : "Usar un código de recuperación"}
          </button>
        </div>

        <div className="text-center">
          <button type="button" className="btn btn-link btn-sm text-muted" onClick={cancelar}>
            Cancelar e ingresar con otra cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
