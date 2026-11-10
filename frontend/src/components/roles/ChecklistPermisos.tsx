"use client";

import { INFO_PERMISOS, PERMISOS, type Permiso } from "@/lib/roles";

interface ChecklistPermisosProps {
  seleccionados: Permiso[];
  onChange: (permisos: Permiso[]) => void;
  deshabilitado?: boolean;
}

/** Ocho casillas, una por permiso, con una frase de qué permite cada una. */
export default function ChecklistPermisos({
  seleccionados,
  onChange,
  deshabilitado = false,
}: ChecklistPermisosProps) {
  const alternar = (permiso: Permiso) => {
    onChange(
      seleccionados.includes(permiso)
        ? seleccionados.filter((p) => p !== permiso)
        : [...seleccionados, permiso]
    );
  };

  return (
    <div className="row g-2">
      {PERMISOS.map((permiso) => (
        <div className="col-md-6" key={permiso}>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id={`permiso-${permiso}`}
              checked={seleccionados.includes(permiso)}
              onChange={() => alternar(permiso)}
              disabled={deshabilitado}
            />
            <label className="form-check-label" htmlFor={`permiso-${permiso}`}>
              <span className="fw-semibold">{INFO_PERMISOS[permiso].etiqueta}</span>
              <span className="d-block text-muted small">{INFO_PERMISOS[permiso].descripcion}</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
