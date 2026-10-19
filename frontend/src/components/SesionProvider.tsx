"use client";

import { createContext, useContext } from "react";
import type { TokenPayload } from "@/lib/session";

const SesionContext = createContext<TokenPayload | null>(null);

export function SesionProvider({
  sesion,
  children,
}: {
  sesion: TokenPayload;
  children: React.ReactNode;
}) {
  return <SesionContext.Provider value={sesion}>{children}</SesionContext.Provider>;
}

// Solo se usa dentro de la zona privada, donde el layout ya garantizo que hay sesion.
export function useSesion(): TokenPayload {
  const sesion = useContext(SesionContext);
  if (!sesion) {
    throw new Error("useSesion debe usarse dentro de la zona privada");
  }
  return sesion;
}
