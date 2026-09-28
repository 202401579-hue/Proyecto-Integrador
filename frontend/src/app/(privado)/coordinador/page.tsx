"use client";

import { useSesion } from "@/components/SesionProvider";

export default function PaginaCoordinador() {
  const { rol } = useSesion();

  return (
    <div className="text-center py-5">
      <h1 className="mb-3">Bienvenido, {rol}</h1>
      <p className="text-muted">Elegí un módulo en el menú de la izquierda para comenzar.</p>
    </div>
  );
}