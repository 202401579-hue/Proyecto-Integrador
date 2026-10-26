"use client";

import { useEffect, useState } from "react";
import { useSesion } from "@/components/SesionProvider";
import { listarUsuarios, type Usuario } from "@/lib/usuarios";

/**
 * Listado de usuarios para el Administrador (Sprint 5).
 *
 * Dos columnas muestran el estado del segundo factor, y son dos cosas
 * distintas que conviene no confundir: "MFA obligatorio" es lo que el
 * administrador le exige, y "MFA configurado" es lo que el usuario ya hizo.
 * La combinación interesante es exigido pero sin configurar, que es la que
 * avisa que a ese usuario el próximo inicio de sesión lo va a mandar a
 * configurarlo.
 */

interface TablaUsuariosProps {
  /**
   * Señal de recarga. Cada vez que cambia, la tabla vuelve a pedir la lista.
   * Es lo que usa la página para refrescar después de crear, editar o dar de
   * baja, sin recargar el navegador.
   */
  recargar?: number;
  /**
   * Las tres acciones por fila las ejecuta la página, no la tabla: ahí están
   * el formulario que hay que llenar al editar, el aviso de resultado y la
   * señal de recarga. La tabla solo dice sobre qué usuario se hizo clic.
   */
  onEditar: (usuario: Usuario) => void;
  onReiniciarMfa: (usuario: Usuario) => void;
  onDarDeBaja: (usuario: Usuario) => void;
  /** Hay una operación en curso: se bloquean los botones de todas las filas. */
  ocupado?: boolean;
}

/** Badge de la columna "MFA obligatorio". */
function BadgeObligatorio({ obligatorio }: { obligatorio: boolean }) {
  return obligatorio ? (
    <span className="badge bg-primary">Sí</span>
  ) : (
    <span className="badge bg-light text-secondary border">No</span>
  );
}

/**
 * Badge de la columna "MFA configurado".
 *
 * El caso "Pendiente" es el que justifica que esto no sea un sí o no: el
 * usuario tiene la exigencia encima pero todavía no configuró nada.
 */
function BadgeConfigurado({ usuario }: { usuario: Usuario }) {
  if (usuario.twoFactorEnabled) {
    return (
      <span className="badge bg-success">
        <i className="bi bi-shield-check me-1" />
        Activo
      </span>
    );
  }

  if (usuario.mfaObligatorio) {
    return <span className="badge bg-warning text-dark">Pendiente</span>;
  }

  return <span className="badge bg-light text-secondary border">No</span>;
}

export default function TablaUsuarios({
  recargar = 0,
  onEditar,
  onReiniciarMfa,
  onDarDeBaja,
  ocupado = false,
}: TablaUsuariosProps) {
  // null es la primera carga, y por eso no hay un estado "cargando" aparte:
  // al cambiar el interruptor se siguen mostrando las filas anteriores hasta
  // que llegan las nuevas, en lugar de parpadear un "Cargando…".
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const sesion = useSesion();

  useEffect(() => {
    // Si el usuario mueve el interruptor dos veces rápido, las respuestas
    // pueden volver desordenadas. Este testigo descarta la de la consulta
    // que ya quedó vieja, así la tabla no termina mostrando lo contrario de
    // lo que dice el interruptor.
    let vigente = true;

    const pedir = async () => {
      const resultado = await listarUsuarios(mostrarInactivos);
      if (!vigente) return;

      if (resultado.ok) {
        setUsuarios(resultado.datos);
        setError("");
      } else {
        setUsuarios([]);
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
        <h6 className="m-0 fw-bold text-primary">Usuarios</h6>
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="mostrarInactivos"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          <label className="form-check-label small" htmlFor="mostrarInactivos">
            Mostrar inactivos
          </label>
        </div>
      </div>

      <div className="card-body">
        {error && <div className="alert alert-danger py-2">{error}</div>}

        {usuarios === null ? (
          <p className="text-muted mb-0">Cargando…</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>MFA obligatorio</th>
                  <th>MFA configurado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario._id}
                    className={!usuario.activo ? "table-secondary" : ""}
                  >
                    <td>
                      {usuario.nombre}
                      {usuario._id === sesion.id && (
                        <span className="text-muted small ms-2">(usted)</span>
                      )}
                      {!usuario.activo && (
                        <span className="badge bg-secondary ms-2">Inactivo</span>
                      )}
                    </td>
                    <td>{usuario.correo}</td>
                    <td>{usuario.rol}</td>
                    <td>
                      <BadgeObligatorio obligatorio={usuario.mfaObligatorio} />
                    </td>
                    <td>
                      <BadgeConfigurado usuario={usuario} />
                    </td>
                    <td>
                      <div className="d-flex gap-1 justify-content-end flex-wrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => onEditar(usuario)}
                          disabled={ocupado || !usuario.activo}
                        >
                          Editar
                        </button>

                        {/* Solo se ofrece a quien tiene algo que reiniciar.
                            En los demás no haría nada visible: el backend
                            responde 200 igual, y un botón que contesta "no
                            tenía nada activado" es un botón que no debería
                            haber estado. */}
                        {usuario.twoFactorEnabled && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => onReiniciarMfa(usuario)}
                            disabled={ocupado || !usuario.activo}
                            title="Borra su autenticador y sus códigos de recuperación"
                          >
                            Reiniciar MFA
                          </button>
                        )}

                        {/* La propia cuenta no se puede dar de baja: el
                            backend responde 409. Se deshabilita acá para que
                            la razón se vea antes del clic y no después. */}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onDarDeBaja(usuario)}
                          disabled={ocupado || !usuario.activo || usuario._id === sesion.id}
                          title={
                            usuario._id === sesion.id
                              ? "No puede darse de baja a sí mismo"
                              : "Pasa la cuenta a inactiva"
                          }
                        >
                          Dar de baja
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && !error && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-3">
                      No hay usuarios para mostrar.
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
