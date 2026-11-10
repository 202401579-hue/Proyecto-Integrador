"use client";

interface NavbarPrivadoProps {
  /** Nombres de los roles del usuario (puede tener varios). */
  roles: string[];
}

export default function NavbarPrivado({ roles }: NavbarPrivadoProps) {
  return (
    <nav
      className="navbar navbar-light bg-white shadow-sm px-4 d-flex justify-content-between"
      style={{ minHeight: "64px" }}
    >
      <span className="navbar-brand mb-0 h5 text-dark fw-semibold">
        Sistema de Gestión Logística
      </span>
      <span className="d-flex gap-2 align-self-center flex-wrap justify-content-end">
        {roles.length === 0 ? (
          <span className="badge bg-secondary px-3 py-2">Sin rol</span>
        ) : (
          roles.map((rol) => (
            <span className="badge bg-primary px-3 py-2" key={rol}>
              {roles.length === 1 ? `Rol: ${rol}` : rol}
            </span>
          ))
        )}
      </span>
    </nav>
  );
}
