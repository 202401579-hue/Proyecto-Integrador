"use client";

import { useState, FormEvent } from "react";
import ChecklistPermisos from "@/components/roles/ChecklistPermisos";
import { actualizarRol, crearRol, type Permiso, type RolSistema } from "@/lib/roles";

interface FormularioRolProps {
  /** null para crear; un rol para editarlo. */
  rol: RolSistema | null;
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
}

/**
 * Modal de alta y edición de roles. Se muestra con useState (la página lo
 * monta solo cuando hace falta), no con el JavaScript de Bootstrap, porque
 * las versiones del CSS y del JS del proyecto no coinciden.
 *
 * Las validaciones son las mismas del backend (nombre de 3 a 60 caracteres,
 * al menos un permiso), pero la que manda es siempre la del backend: sus
 * mensajes de 400 y 409 se muestran tal cual.
 */
export default function FormularioRol({ rol, onGuardado, onCancelar }: FormularioRolProps) {
  const editando = rol !== null;

  const [nombre, setNombre] = useState(rol?.nombreRol ?? "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "");
  const [permisos, setPermisos] = useState<Permiso[]>(rol?.permisos ?? []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const primerProblema = (): string | null => {
    const largo = nombre.trim().length;
    if (largo < 3 || largo > 60) return "El nombre del rol debe tener entre 3 y 60 caracteres.";
    if (descripcion.length > 200) return "La descripción no puede exceder 200 caracteres.";
    if (permisos.length === 0) return "Seleccione al menos un permiso.";
    return null;
  };

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const problema = primerProblema();
    if (problema) {
      setError(problema);
      return;
    }

    const datos = { nombreRol: nombre.trim(), descripcion: descripcion.trim(), permisos };
    setGuardando(true);
    const resultado = editando ? await actualizarRol(rol._id, datos) : await crearRol(datos);
    setGuardando(false);

    if (!resultado.ok) {
      setError(resultado.mensaje);
      return;
    }
    onGuardado(
      editando
        ? `Rol "${resultado.datos.nombreRol}" actualizado.`
        : `Rol "${resultado.datos.nombreRol}" creado.`
    );
  };

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", overflowY: "auto" }}
    >
      <div className="modal-dialog modal-lg">
        <form className="modal-content" onSubmit={enviar} noValidate>
          <div className="modal-header">
            <h5 className="modal-title">
              {editando ? `Editar rol: ${rol.nombreRol}` : "Crear rol"}
            </h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Cerrar"
              onClick={onCancelar}
              disabled={guardando}
            />
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <label htmlFor="nombreRol" className="form-label">
                Nombre del rol
              </label>
              <input
                id="nombreRol"
                type="text"
                className="form-control"
                maxLength={60}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="descripcionRol" className="form-label">
                Descripción
              </label>
              <textarea
                id="descripcionRol"
                className="form-control"
                rows={2}
                maxLength={200}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            <p className="form-label mb-2">Permisos</p>
            <ChecklistPermisos
              seleccionados={permisos}
              onChange={setPermisos}
              deshabilitado={guardando}
            />

            {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onCancelar}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary px-4" disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear rol"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
