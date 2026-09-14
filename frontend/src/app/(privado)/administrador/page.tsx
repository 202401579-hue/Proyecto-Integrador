"use client";

import { useEffect, useState } from "react";
import { obtenerSesion } from "@/lib/session";

export default function PaginaAdministrador() {
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    setRol(obtenerSesion()?.rol ?? null);
  }, []);

  return <h1 className="h3">{rol}</h1>;
}
