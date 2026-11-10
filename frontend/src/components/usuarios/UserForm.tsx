"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { useSesion } from "@/components/SesionProvider";
import { llamarApi, type Usuario } from "@/lib/usuarios";
import { listarRoles, type RolSistema } from "@/lib/roles";

/**
 * Alta y edición de usuarios (Sprint 5).
 *
 * El mismo formulario sirve para las dos cosas: con `usuario` en null crea
 * (POST) y con un usuario edita (PUT). La diferencia que se ve en pantalla es
 * la contraseña, que al crear es obligatoria y al editar se deja vacía para
 * no cambiarla.
 *
 * Las validaciones de acá son las mismas que hace el backend. No lo
 * reemplazan: sirven para avisar sin ir hasta el servidor. La que manda es
 * siempre la del backend, y por eso los errores se muestran con su `mensaje`
 * tal como viene.
 */

/** Mismo mínimo que exige el backend en LARGO_MINIMO_PASSWORD. */
const LARGO_MINIMO_PASSWORD = 8;

/** Mismo formato que valida el esquema del modelo. */
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserFormProps {
  /** null para crear; un usuario para editarlo. */
  usuario: Usuario | null;
  /**
   * Guardó bien: la página muestra el mensaje y refresca la tabla.
   *
   * IMPORTANTE: la página monta este componente con una `key` distinta por
   * usuario. Así, al pasar de una fila a otra, React lo vuelve a montar y los
   * campos arrancan con los valores nuevos, sin tener que copiar props al
   * estado dentro de un efecto.
   */
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
}

export default function UserForm({ usuario, onGuardado, onCancelar }: UserFormProps) {
  const editando = usuario !== null;
  const sesion = useSesion();

  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [correo, setCorreo] = useState(usuario?.correo ?? "");
  const [password, setPassword] = useState("");
  // Ids de los roles marcados. Al crear no hay ninguno marcado: el
  // administrador tiene que elegir a propósito.
  const [rolesElegidos, setRolesElegidos] = useState<string[]>(
    usuario?.roles.map((r) => r._id) ?? []
  );
  // Roles disponibles: salen de GET /api/roles?activo=true al montar, no de
  // una lista escrita en el código. Un rol recién creado aparece solo.
  const [rolesDisponibles, setRolesDisponibles] = useState<RolSistema[] | null>(null);
  const [errorRoles, setErrorRoles] = useState("");
  const [mfaObligatorio, setMfaObligatorio] = useState(usuario?.mfaObligatorio ?? false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const esSuPropiaCuenta = editando && usuario._id === sesion.id;

  useEffect(() => {
    let vigente = true;
    const pedir = async () => {
      const resultado = await listarRoles(false);
      if (!vigente) return;
      if (resultado.ok) {
        setRolesDisponibles(resultado.datos);
      } else {
        setRolesDisponibles([]);
        setErrorRoles(resultado.mensaje);
      }
    };
    pedir();
    return () => {
      vigente = false;
    };
  }, []);

  // Roles que el usuario ya tiene pero que dejaron de estar activos: se
  // muestran marcados para que se vea el estado real. Guardar con uno de
  // ellos lo rechaza el backend, y hay que desmarcarlo.
  const rolesInactivosDelUsuario = (usuario?.roles ?? []).filter(
    (r) => !rolesDisponibles?.some((d) => d._id === r._id)
  );

  const alternarRol = (id: string) => {
    setRolesElegidos((actuales) =>
      actuales.includes(id) ? actuales.filter((r) => r !== id) : [...actuales, id]
    );
  };

  /** Devuelve el primer problema que encuentra, o null si está todo bien. */
  const primerProblema = (): string | null => {
    if (!nombre.trim()) {
      return "El nombre es obligatorio.";
    }

    if (!FORMATO_CORREO.test(correo.trim())) {
      return "El correo no tiene un formato válido.";
    }

    if (!editando && !password) {
      return "La contraseña es obligatoria al crear un usuario.";
    }

    if (password && password.length < LARGO_MINIMO_PASSWORD) {
      return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
    }

    // Un administrador no puede tocar sus propios roles (el backend responde
    // 409), así que ahí el campo no se valida ni se envía.
    if (!esSuPropiaCuenta && rolesElegidos.length === 0) {
      return "Seleccione al menos un rol.";
    }

    return null;
  };

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const problema = primerProblema();
    if (problema) {
      setError(problema);
      return;
    }

    // Al editar, la contraseña solo viaja si se escribió algo: el backend
    // trata todos los campos del PUT como opcionales, así que no mandarla es
    // exactamente "dejala como está".
    const cuerpo: Record<string, unknown> = {
      nombre: nombre.trim(),
      correo: correo.trim(),
      mfaObligatorio,
    };
    if (!esSuPropiaCuenta) {
      cuerpo.roles = rolesElegidos;
    }
    if (password) {
      cuerpo.password = password;
    }

    setGuardando(true);
    const resultado = await llamarApi<Usuario>(
      editando ? `/api/usuarios/${usuario._id}` : "/api/usuarios",
      { metodo: editando ? "PUT" : "POST", cuerpo }
    );
    setGuardando(false);

    if (!resultado.ok) {
      // Acá caen los 409: correo repetido, o un administrador intentando
      // quitarse a sí mismo el rol. El mensaje del backend explica cuál de
      // las dos reglas se chocó.
      setError(resultado.mensaje);
      return;
    }

    onGuardado(
      editando
        ? `Usuario "${resultado.datos.nombre}" actualizado.`
        : `Usuario "${resultado.datos.nombre}" creado.`
    );
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header bg-white py-3">
        <h6 className="m-0 fw-bold text-primary">
          {editando ? `Editar usuario: ${usuario.nombre}` : "Crear usuario"}
        </h6>
      </div>
      <div className="card-body">
        <form onSubmit={manejarEnvio} noValidate>
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="nombre" className="form-label">
                Nombre
              </label>
              <input
                id="nombre"
                type="text"
                className="form-control"
                value={nombre}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNombre(e.target.value)}
              />
            </div>

            <div className="col-md-6">
              <label htmlFor="correo" className="form-label">
                Correo electrónico
              </label>
              <input
                id="correo"
                type="email"
                className="form-control"
                value={correo}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCorreo(e.target.value)}
              />
            </div>

            <div className="col-md-6">
              <label htmlFor="password" className="form-label">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                className="form-control"
                autoComplete="new-password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              />
              <div className="form-text">
                {editando
                  ? "Dejar vacío para no cambiarla"
                  : `Mínimo ${LARGO_MINIMO_PASSWORD} caracteres`}
              </div>
            </div>

            <div className="col-md-6">
              <span className="form-label d-block">Roles</span>
              {rolesDisponibles === null ? (
                <div className="text-muted small">Cargando roles…</div>
              ) : errorRoles ? (
                <div className="alert alert-danger py-2 mb-0">
                  No se pudieron cargar los roles: {errorRoles}
                </div>
              ) : (
                <div className="border rounded p-2" style={{ maxHeight: 180, overflowY: "auto" }}>
                  {[...rolesDisponibles, ...rolesInactivosDelUsuario].map((rol) => {
                    const inactivo = !rolesDisponibles.some((d) => d._id === rol._id);
                    return (
                      <div className="form-check" key={rol._id}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`rol-${rol._id}`}
                          checked={rolesElegidos.includes(rol._id)}
                          onChange={() => alternarRol(rol._id)}
                          disabled={esSuPropiaCuenta}
                        />
                        <label className="form-check-label" htmlFor={`rol-${rol._id}`}>
                          {rol.nombreRol}
                          {inactivo && <span className="text-muted small"> (inactivo)</span>}
                        </label>
                      </div>
                    );
                  })}
                  {rolesDisponibles.length === 0 && (
                    <div className="text-muted small">No hay roles activos.</div>
                  )}
                </div>
              )}
              {esSuPropiaCuenta ? (
                <div className="form-text">
                  Es su propia cuenta: no puede modificar sus propios roles.
                </div>
              ) : (
                <div className="form-text">Elija uno o varios; al menos uno es obligatorio.</div>
              )}
            </div>

            <div className="col-12">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="mfaObligatorio"
                  checked={mfaObligatorio}
                  onChange={(e) => setMfaObligatorio(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="mfaObligatorio">
                  Requerir Autenticación Multifactor (MFA)
                </label>
              </div>
              <div className="form-text">
                El usuario deberá configurar Google Authenticator en su próximo
                inicio de sesión.
              </div>

              {/* Quitar la exigencia no apaga el autenticador de quien ya lo
                  configuró: el backend no toca twoFactorEnabled en el PUT. Sin
                  este aviso, el administrador cree que lo desactivó y el
                  usuario sigue teniendo que poner el código. */}
              {editando && usuario.twoFactorEnabled && !mfaObligatorio && (
                <div className="alert alert-info py-2 mt-2 mb-0 small">
                  Este usuario ya tiene el autenticador configurado. Quitar la
                  exigencia <strong>no se lo desactiva</strong>: va a seguir
                  pidiéndole el código al entrar. Para quitárselo, use
                  &quot;Reiniciar MFA&quot; en su fila.
                </div>
              )}
            </div>
          </div>

          {error && <div className="alert alert-danger py-2 mt-3">{error}</div>}

          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-primary px-4" disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
            </button>
            {editando && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onCancelar}
                disabled={guardando}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
