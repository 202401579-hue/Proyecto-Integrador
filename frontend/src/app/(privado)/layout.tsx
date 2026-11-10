"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import { sesionDesdeToken } from "@/lib/session";
import { puedeAcceder } from "@/lib/permisosRutas";
import NavbarPrivado from "@/components/NavbarPrivado";
import Sidebar from "@/components/Sidebar";
import { SesionProvider } from "@/components/SesionProvider";

function suscribirseAlToken(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}
const leerToken = () => localStorage.getItem("token");
const sinTokenEnServidor = () => null;
const sinSuscripcion = () => () => {};

export default function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const token = useSyncExternalStore(suscribirseAlToken, leerToken, sinTokenEnServidor);

  const sesion = sesionDesdeToken(token);

  // El guard mira los permisos que trae el token (lib/permisosRutas.ts). Es
  // solo comodidad de pantalla: el backend vuelve a comprobarlos en cada
  // petición y responde 403 aunque alguien salte este guard.
  const dentroDeSuSeccion = !!sesion && puedeAcceder(sesion.permisos, pathname);

  useEffect(() => {
    if (!montado) return;

    if (!sesion) {
      router.replace("/login");
    } else if (!dentroDeSuSeccion) {
      router.replace("/sin-acceso");
    }
  }, [montado, sesion, dentroDeSuSeccion, router]);

  useEffect(() => {
    const revalidar = (evento: PageTransitionEvent) => {
      if (evento.persisted && !sesionDesdeToken(leerToken())) {
        window.location.replace("/login");
      }
    };
    window.addEventListener("pageshow", revalidar);
    return () => window.removeEventListener("pageshow", revalidar);
  }, []);

  if (!montado || !sesion || !dentroDeSuSeccion) {
    return null;
  }

  return (
    <SesionProvider sesion={sesion}>
      {/* La hoja de iconos se carga en el layout raíz, que ahora la necesitan
          también las pantallas del segundo factor en el login. */}
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      <div className="d-flex" style={{ minHeight: "100vh" }}>
        <Sidebar permisos={sesion.permisos} />
        <div className="flex-grow-1 d-flex flex-column">
          <NavbarPrivado roles={sesion.roles} />
          <main
            className="container-fluid py-4 flex-grow-1"
            style={{ backgroundColor: "#f8f9fc" }}
          >
            {children}
          </main>
        </div>
      </div>
    </SesionProvider>
  );
}