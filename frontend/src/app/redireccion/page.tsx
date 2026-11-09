"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { obtenerSesion } from "@/lib/session";
import { rutaInicial } from "@/lib/permisos";

export default function PaginaRedireccion() {
  const router = useRouter();

  useEffect(() => {
    const sesion = obtenerSesion();

    if (!sesion) {
      router.replace("/login");
      return;
    }

    router.replace(rutaInicial(sesion.permisos));
  }, [router]);

  return null;
}
