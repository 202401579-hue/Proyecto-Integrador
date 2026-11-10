"use client";

import { useState } from "react";
import FormularioRol from "@/components/roles/FormularioRol";
import TablaRoles from "@/components/roles/TablaRoles";
import { actualizarRol, desactivarRol, type RolSistema, type UsuarioConRol } from "@/lib/roles";

/**
 * Catálogo de roles (Sprint 7). Requiere el permiso `roles`.
 *
 * El layout y el Sidebar solo ocultan esta pantalla; lo que protege los datos
 * es checkPermission('roles') en el backend.
 */

interface Aviso {
  tipo: "success" | "danger";
  texto: string;
  /** Usuarios que impiden desactivar el rol (409). */
  usuarios?: UsuarioConRol[];
}

export default function PaginaRoles() {
  // undefined = formulario cerrado; null = creando; un rol = editando.
  const [formulario, setFormulario] = useState<RolSistema | null | undefined>(undefined);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recargar, setRecargar] = useState(0);
  const refrescar = () => setRecargar((v) => v + 1);

  const guardado = (texto: string) => {
    setAviso({ tipo: "success", texto });
    setFormulario(undefined);
    refrescar();
  };

  const desactivar = async (rol: RolSistema) => {
    const confirmado = window.confirm(
      `¿Desactivar el rol "${rol.nombreRol}"?\n\n` +
        "No se borra: queda inactivo y se puede reactivar. Si hay usuarios activos con este rol, el sistema no lo permite."
    );
    if (!confirmado) return;

    setAviso(null);
    setOcupado(true);
    const resultado = await desactivarRol(rol._id);
    setOcupado(false);

    if (!resultado.ok) {
      // El 409 trae el mensaje y la lista de usuarios que impiden la baja.
      setAviso({ tipo: "danger", texto: resultado.mensaje, usuarios: resultado.usuarios });
      return;
    }
    setAviso({ tipo: "success", texto: `Rol "${rol.nombreRol}" desactivado.` });
    refrescar();
  };

  const reactivar = async (rol: RolSistema) => {
    setAviso(null);
    setOcupado(true);
    const resultado = await actualizarRol(rol._id, { activo: true });
    setOcupado(false);

    if (!resultado.ok) {
      setAviso({ tipo: "danger", texto: resultado.mensaje });
      return;
    }
    setAviso({ tipo: "success", texto: `Rol "${rol.nombreRol}" reactivado.` });
    refrescar();
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="h4 m-0 d-flex align-items-center gap-2">
          <i className="bi bi-shield-lock text-primary" />
          Roles
        </h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setAviso(null);
            setFormulario(null);
          }}
        >
          <i className="bi bi-plus-lg me-1" />
          Crear rol
        </button>
      </div>

      {aviso && (
        <div className={`alert alert-${aviso.tipo} py-2`} role="alert">
          <div>{aviso.texto}</div>
          {aviso.usuarios && aviso.usuarios.length > 0 && (
            <div className="mt-2">
              <strong>Usuarios activos con este rol:</strong>
              <ul className="mb-0">
                {aviso.usuarios.map((u) => (
                  <li key={u._id}>
                    {u.nombre} ({u.correo})
                  </li>
                ))}
              </ul>
              <div className="small mt-1">
                Reasígneles otro rol o dé de baja la cuenta en Usuarios y vuelva a intentarlo.
              </div>
            </div>
          )}
        </div>
      )}

      <TablaRoles
        recargar={recargar}
        ocupado={ocupado}
        onEditar={(rol) => {
          setAviso(null);
          setFormulario(rol);
        }}
        onDesactivar={desactivar}
        onReactivar={reactivar}
      />

      {formulario !== undefined && (
        <FormularioRol
          key={formulario?._id ?? "nuevo"}
          rol={formulario}
          onGuardado={guardado}
          onCancelar={() => setFormulario(undefined)}
        />
      )}
    </div>
  );
}
