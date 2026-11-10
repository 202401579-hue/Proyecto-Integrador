"use client";

// Colores de la puntualidad en la cola (Sprint 6): distintos de los que usa
// claseColorEstado() en lib/estados.ts a propósito (ahí ANTICIPADO es
// celeste y AUSENTE es rojo; acá se pide azul y gris). Se compara el texto
// tal cual manda el backend: "A TIEMPO" con espacio, "TARDÍO" con tilde.
const CLASE_POR_PUNTUALIDAD: Record<string, string> = {
  "A TIEMPO": "bg-success",
  ANTICIPADO: "bg-primary",
  TARDÍO: "bg-warning text-dark",
  AUSENTE: "bg-secondary",
};

const CLASE_DESCONOCIDA = "bg-secondary";

interface BadgePuntualidadProps {
  puntualidad: string;
}

export default function BadgePuntualidad({ puntualidad }: BadgePuntualidadProps) {
  const clase = CLASE_POR_PUNTUALIDAD[puntualidad] ?? CLASE_DESCONOCIDA;
  return <span className={`badge ${clase}`}>{puntualidad}</span>;
}
