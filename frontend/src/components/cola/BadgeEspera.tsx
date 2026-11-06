"use client";

interface BadgeEsperaProps {
  minutosEnEspera: number;
  excedeLimite: boolean;
}

/** Minutos en espera: rojo cuando excedeLimite (lo decide el backend contra LIMITE_ESPERA_MAX). */
export default function BadgeEspera({ minutosEnEspera, excedeLimite }: BadgeEsperaProps) {
  const clase = excedeLimite ? "bg-danger" : "bg-light text-dark border";

  return (
    <span
      className={`badge ${clase}`}
      title={excedeLimite ? "Superó el límite de espera" : "Minutos en espera"}
    >
      {minutosEnEspera} min en espera
    </span>
  );
}
