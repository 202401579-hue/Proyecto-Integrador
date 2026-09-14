"use client";

import { useRouter } from "next/navigation";
import { eliminarToken, Rol } from "@/lib/session";

interface NavbarPrivadoProps {
  rol: Rol;
}

export default function NavbarPrivado({ rol }: NavbarPrivadoProps) {
  const router = useRouter();

  function manejarLogout() {
    eliminarToken();
    router.replace("/login");
  }

  return (
    <nav className="navbar navbar-expand-md navbar-dark bg-dark px-3">
      <span className="navbar-brand mb-0 h1">Sistema de Gestión Logística</span>

      <button
        className="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarPrivado"
        aria-controls="navbarPrivado"
        aria-expanded="false"
        aria-label="Alternar navegación"
      >
        <span className="navbar-toggler-icon"></span>
      </button>

      <div className="collapse navbar-collapse justify-content-end" id="navbarPrivado">
        <div className="d-flex align-items-center gap-3">
          <span className="text-white-50">Rol: {rol}</span>
          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            onClick={manejarLogout}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  );
}
