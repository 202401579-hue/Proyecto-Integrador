"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { obtenerSesion, TokenPayload } from "@/lib/session";
import NavbarPrivado from "@/components/NavbarPrivado";

export default function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sesion, setSesion] = useState<TokenPayload | null>(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    const sesionActual = obtenerSesion();

    if (!sesionActual) {
      router.replace("/login");
      return;
    }

    setSesion(sesionActual);
    setVerificando(false);
  }, [router]);

  if (verificando || !sesion) {
    return null;
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      <NavbarPrivado rol={sesion.rol} />
      <main className="container py-4">{children}</main>
    </>
  );
}
