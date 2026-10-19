"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { obtenerSesion, obtenerRutaPorRol } from "@/lib/session";

export default function PaginaRedireccion() {
  const router = useRouter();

  useEffect(() => {
    const sesion = obtenerSesion();

    if (!sesion) {
      router.replace("/login");
      return;
    }

    router.replace(obtenerRutaPorRol(sesion.rol));
  }, [router]);

  return null;
}
