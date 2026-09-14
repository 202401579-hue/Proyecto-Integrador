"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import { obtenerRutaPorRol, sesionDesdeToken } from "@/lib/session";
import NavbarPrivado from "@/components/NavbarPrivado";
import { SesionProvider } from "@/components/SesionProvider";

// La sesion se lee de localStorage en cada render, sin copiarla a un estado de
// React. Asi no queda un estado viejo en memoria que haya que limpiar al salir.
function suscribirseAlToken(avisar: () => void) {
  // "storage" avisa cuando otra pestana cambia el token, por ejemplo al hacer logout.
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}
const leerToken = () => localStorage.getItem("token");
const sinTokenEnServidor = () => null;
const sinSuscripcion = () => () => {};

export default function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // false mientras se renderiza en el servidor, true ya montado en el navegador.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const token = useSyncExternalStore(suscribirseAlToken, leerToken, sinTokenEnServidor);

  const sesion = sesionDesdeToken(token);
  const rutaDelRol = sesion ? obtenerRutaPorRol(sesion.rol) : null;

  useEffect(() => {
    if (!montado) return;

    if (!rutaDelRol) {
      router.replace("/login");
    } else if (pathname !== rutaDelRol) {
      // Cada rol solo puede estar en su propia seccion.
      router.replace(rutaDelRol);
    }
  }, [montado, rutaDelRol, pathname, router]);

  // Al volver con "atras", el navegador puede restaurar la pagina desde su
  // cache (bfcache) sin volver a ejecutar los efectos. Se revalida en pageshow.
  useEffect(() => {
    const revalidar = (evento: PageTransitionEvent) => {
      if (evento.persisted && !sesionDesdeToken(leerToken())) {
        window.location.replace("/login");
      }
    };
    window.addEventListener("pageshow", revalidar);
    return () => window.removeEventListener("pageshow", revalidar);
  }, []);

  // Mientras no se confirme la sesion y el rol, no se muestra nada.
  if (!montado || !sesion || pathname !== rutaDelRol) {
    return null;
  }

  return (
    <SesionProvider sesion={sesion}>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      <NavbarPrivado rol={sesion.rol} />
      <main className="container py-4">{children}</main>
    </SesionProvider>
  );
}
