"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import { obtenerRutaPorRol, sesionDesdeToken } from "@/lib/session";
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
  const rutaDelRol = sesion ? obtenerRutaPorRol(sesion.rol) : null;

  const dentroDeSuSeccion =
    !!rutaDelRol && (pathname === rutaDelRol || pathname.startsWith(`${rutaDelRol}/`));

  useEffect(() => {
    if (!montado) return;

    if (!rutaDelRol) {
      router.replace("/login");
    } else if (!dentroDeSuSeccion) {
      router.replace(rutaDelRol);
    }
  }, [montado, rutaDelRol, dentroDeSuSeccion, router]);

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
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      <div className="d-flex" style={{ minHeight: "100vh" }}>
        <Sidebar rol={sesion.rol} />
        <div className="flex-grow-1 d-flex flex-column">
          <NavbarPrivado rol={sesion.rol} />
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