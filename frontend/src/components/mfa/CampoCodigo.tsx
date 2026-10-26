"use client";

import type { ChangeEvent } from "react";

/**
 * Campo del código de seis dígitos del autenticador (Sprint 5).
 *
 * Lo usan las dos pantallas del segundo factor: el modal de enrolamiento,
 * para activar, y /login/mfa, para entrar. Está separado porque el detalle
 * que importa es el mismo en los dos lados y es fácil de arruinar.
 *
 * Es `type="text"` y no `type="number"` a propósito. Un campo numérico trae
 * flechitas, acepta signos y notación científica, y sobre todo maltrata los
 * ceros a la izquierda: un código TOTP arranca con cero una de cada diez
 * veces, y perderlo haría fallar el segundo factor el 10% de las veces sin
 * que el usuario hiciera nada mal. La combinación text + inputMode numeric
 * + pattern es la que abre el teclado numérico en el celular sin ninguna de
 * esas consecuencias.
 *
 * `autoComplete="one-time-code"` es lo que le permite al teléfono ofrecer el
 * código de un SMS o del llavero sin que haya que tipearlo.
 */

/** Deja solo dígitos y corta en seis. */
const soloSeisDigitos = (texto: string): string => texto.replace(/\D/g, "").slice(0, 6);

interface CampoCodigoProps {
  valor: string;
  onChange: (valor: string) => void;
  /** Distinto por pantalla, porque las dos pueden existir en el mismo DOM. */
  id?: string;
  etiqueta?: string;
  deshabilitado?: boolean;
  autoFocus?: boolean;
}

export default function CampoCodigo({
  valor,
  onChange,
  id = "codigo",
  etiqueta = "Código de seis dígitos",
  deshabilitado = false,
  autoFocus = false,
}: CampoCodigoProps) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        className="form-control form-control-lg text-center font-monospace"
        style={{ letterSpacing: "0.4rem" }}
        placeholder="000000"
        value={valor}
        // Se limpia acá y no al enviar: así un pegado con espacios ("123 456")
        // o una letra suelta no dejan el campo en un estado que el backend va
        // a rechazar, y el usuario ve en el acto qué quedó escrito.
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(soloSeisDigitos(e.target.value))}
        disabled={deshabilitado}
        autoFocus={autoFocus}
      />
    </div>
  );
}
