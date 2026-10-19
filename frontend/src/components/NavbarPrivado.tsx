"use client";

import { Rol } from "@/lib/session";

interface NavbarPrivadoProps {
  rol: Rol;
}

export default function NavbarPrivado({ rol }: NavbarPrivadoProps) {
  return (
    <nav
      className="navbar navbar-light bg-white shadow-sm px-4 d-flex justify-content-between"
      style={{ minHeight: "64px" }}
    >
      <span className="navbar-brand mb-0 h5 text-dark fw-semibold">
        Sistema de Gestión Logística
      </span>
      <span className="badge bg-primary px-3 py-2 align-self-center">
        Rol: {rol}
      </span>
    </nav>
  );
}