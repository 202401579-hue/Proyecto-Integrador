"use client";

import { useState } from "react";

/**
 * Los ocho códigos de recuperación, mostrados una sola vez (Sprint 5).
 *
 * En la base solo quedan sus hashes bcrypt, así que esta pantalla es la
 * única oportunidad de copiarlos. De ahí la casilla: sin ella, un clic
 * apurado en "Continuar" los pierde para siempre, y el usuario que después
 * pierda el teléfono queda afuera del sistema hasta que un administrador le
 * reinicie la verificación.
 */

interface CodigosRecuperacionProps {
  codigos: string[];
  onContinuar: () => void;
}

export default function CodigosRecuperacion({
  codigos,
  onContinuar,
}: CodigosRecuperacionProps) {
  const [guardados, setGuardados] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [errorAlCopiar, setErrorAlCopiar] = useState("");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiado(true);
      setErrorAlCopiar("");
    } catch {
      // El portapapeles necesita permiso y un contexto seguro, y no siempre
      // está. No es grave: los códigos están a la vista para copiarlos a
      // mano, pero hay que decirlo en lugar de no hacer nada al hacer clic.
      setCopiado(false);
      setErrorAlCopiar("No se pudo usar el portapapeles. Cópielos a mano.");
    }
  };

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
        {codigos.map((codigo) => (
          <div className="col" key={codigo}>
            <div className="border rounded bg-light text-center font-monospace py-2">
              {codigo}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-outline-secondary btn-sm w-100 mb-3"
        onClick={copiar}
      >
        <i className={`bi ${copiado ? "bi-check2" : "bi-clipboard"} me-1`} />
        {copiado ? "Copiados" : `Copiar los ${codigos.length} códigos`}
      </button>

      {errorAlCopiar && <div className="alert alert-danger py-2">{errorAlCopiar}</div>}

      <div className="form-check mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="codigosGuardados"
          checked={guardados}
          onChange={(e) => setGuardados(e.target.checked)}
        />
        <label className="form-check-label" htmlFor="codigosGuardados">
          Ya guardé mis códigos
        </label>
      </div>

      <button
        type="button"
        className="btn btn-primary w-100"
        onClick={onContinuar}
        disabled={!guardados}
      >
        Continuar
      </button>
    </div>
  );
}
