"use client";

import { useSesion } from "@/components/SesionProvider";

export default function PaginaAdministrador() {
  const { rol } = useSesion();

  return <h1 className="h3">{rol}</h1>;
}
