"use client";

import { useEffect, useState } from "react";
import { INFO_PERMISOS, listarRoles, type RolSistema } from "@/lib/roles";

interface TablaRolesProps {
  /** Cada vez que cambia, la tabla vuelve a pedir la lista. */
  recargar?: number;
  onEditar: (rol: RolSistema) => void;
  onDesactivar: (rol: RolSistema) => void;
  onReactivar: (rol: RolSistema) => void;
  ocupado?: boolean;
}

export default function TablaRoles({
  recargar = 0,
  onEditar,
  onDesactivar,
  onReactivar,
  ocupado = false,
}: TablaRolesProps) {
  const [roles, setRoles] = useState<RolSistema[] | null>(null);
  const [error, setError] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  useEffect(() => {
    // Descarta la respuesta de una consulta que ya quedó vieja si el
    // interruptor se movió dos veces rápido.
    let vigente = true;

    const pedir = async () => {
      const resultado = await listarRoles(mostrarInactivos);
      if (!vigente) return;

      if (resultado.ok) {
        setRoles(resultado.datos);
        setError("");
      } else {
        setRoles([]);
        setError(resultado.mensaje);
      }
    };
    pedir();

    return () => {
      vigente = false;
    };
  }, [mostrarInactivos, recargar]);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <h6 className="m-0 fw-bold text-primary">Roles</h6>
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="mostrarRolesInactivos"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          <label className="form-check-label small" htmlFor="mostrarRolesInactivos">
            Mostrar inactivos
          </label>
        </div>
      </div>

      <div className="card-body">
        {error && <div className="alert alert-danger py-2">{error}</div>}

        {roles === null ? (
          <p className="text-muted mb-0">Cargando…</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Descripción</th>
                  <th>Permisos</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roles.map((rol) => (
                  <tr key={rol._id} className={!rol.activo ? "table-secondary" : ""}>
                    <td className="fw-semibold">{rol.nombreRol}</td>
                    <td className="small">{rol.descripcion || <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {rol.permisos.map((permiso) => (
                          <span className="badge bg-light text-dark border" key={permiso}>
                            {INFO_PERMISOS[permiso]?.etiqueta ?? permiso}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {rol.activo ? (
                        <span className="badge bg-success">Activo</span>
                      ) : (
                        <span className="badge bg-secondary">Inactivo</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-end flex-wrap">
                        {rol.activo ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => onEditar(rol)}
                              disabled={ocupado}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => onDesactivar(rol)}
                              disabled={ocupado}
                            >
                              Desactivar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => onReactivar(rol)}
                            disabled={ocupado}
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-3">
                      No hay roles para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
