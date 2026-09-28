"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { eliminarToken, Rol } from "@/lib/session";

interface EnlaceSidebar {
  href: string;
  label: string;
  icono: string;
}

const ENLACES_POR_ROL: Record<Rol, EnlaceSidebar[]> = {
  Administrador: [
    { href: "/administrador", label: "Inicio", icono: "bi-house" },
    { href: "/administrador/parametros", label: "Parámetros", icono: "bi-sliders" },
  ],
  Coordinador: [
    { href: "/coordinador", label: "Inicio", icono: "bi-house" },
    { href: "/coordinador/proveedores", label: "Proveedores", icono: "bi-building" },
    { href: "/coordinador/pedidos", label: "Pedidos", icono: "bi-calendar-check" },
  ],
  Operador: [
    { href: "/operador", label: "Inicio", icono: "bi-house" },
    { href: "/operador/llegadas", label: "Llegadas", icono: "bi-truck" },
  ],
};

interface SidebarProps {
  rol: Rol;
}

export default function Sidebar({ rol }: SidebarProps) {
  const [abierto, setAbierto] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (window.innerWidth < 768) {
      setAbierto(false);
    }
  }, []);

  function manejarLogout() {
    eliminarToken();
    router.replace("/login");
  }

  const enlaces = ENLACES_POR_ROL[rol] ?? [];
  const rutaInicio = enlaces[0]?.href;

  return (
    <aside
      className="d-flex flex-column text-white"
      style={{
        width: abierto ? "230px" : "68px",
        minHeight: "100vh",
        transition: "width 0.15s ease",
        flexShrink: 0,
        background: "linear-gradient(180deg, #4e73df 0%, #224abe 100%)",
      }}
    >
      <div className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom border-light border-opacity-25">
        {abierto && <span className="fw-bold fs-5 text-white">Logística</span>}
        <button
          type="button"
          className="btn btn-sm btn-outline-light border-0 ms-auto"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? "Colapsar menú" : "Expandir menú"}
        >
          <i className={`bi ${abierto ? "bi-chevron-left" : "bi-chevron-right"}`} />
        </button>
      </div>

      <hr className="text-white-50 my-0 opacity-25" />

      <nav className="flex-grow-1 mt-2">
        <ul className="nav flex-column">
          {enlaces.map((enlace) => {
            const esInicio = enlace.href === rutaInicio;
            const activo = esInicio
              ? pathname === enlace.href
              : pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
            return (
              <li className="nav-item" key={enlace.href}>
                <Link
                  href={enlace.href}
                  title={enlace.label}
                  className={`nav-link d-flex align-items-center gap-3 px-3 py-2 text-white ${
                    activo ? "bg-white bg-opacity-25 fw-semibold" : "opacity-75"
                  }`}
                  style={{ borderRadius: 0 }}
                >
                  <i className={`bi ${enlace.icono} fs-5`} />
                  {abierto && <span>{enlace.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <hr className="text-white-50 my-0 opacity-25" />

      <div className="p-3">
        <button
          type="button"
          className="btn btn-outline-light btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={manejarLogout}
        >
          <i className="bi bi-box-arrow-right" />
          {abierto && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}