'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { obtenerToken } from '@/lib/session';

interface Proveedor {
  _id: string;
  razonSocial: string;
  identificacionTributaria: string;
  categoria: string;
  contactoNombre: string;
  telefono: string;
  emailContacto: string;
  activo: boolean;
  usuarioActualizacion?: string;
}

export default function ProveedoresPage() {
  const [razonSocial, setRazonSocial] = useState('');
  const [identificacionTributaria, setIdentificacionTributaria] = useState('');
  const [categoria, setCategoria] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailContacto, setEmailContacto] = useState('');

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const [idEditando, setIdEditando] = useState<string | null>(null);

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [advertencia, setAdvertencia] = useState('');

  const cargarProveedores = async () => {
    setCargandoLista(true);
    try {
      const token = obtenerToken();
      const query = mostrarInactivos ? '?incluirInactivos=true' : '';
      const respuesta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/proveedores${query}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const datos = await respuesta.json();
      setProveedores(Array.isArray(datos) ? datos : []);
    } catch {
      setProveedores([]);
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivos]);

  const limpiarFormulario = () => {
    setRazonSocial('');
    setIdentificacionTributaria('');
    setCategoria('');
    setContactoNombre('');
    setTelefono('');
    setEmailContacto('');
    setIdEditando(null);
  };

  const iniciarEdicion = (proveedor: Proveedor) => {
    setError('');
    setExito('');
    setRazonSocial(proveedor.razonSocial);
    setIdentificacionTributaria(proveedor.identificacionTributaria);
    setCategoria(proveedor.categoria);
    setContactoNombre(proveedor.contactoNombre);
    setTelefono(proveedor.telefono);
    setEmailContacto(proveedor.emailContacto);
    setIdEditando(proveedor._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inactivarProveedor = async (proveedor: Proveedor) => {
    const confirmar = window.confirm(
      `¿Inactivar a "${proveedor.razonSocial}"? Podrás seguir viéndolo con el filtro de inactivos.`
    );
    if (!confirmar) return;

    setError('');
    setAdvertencia('');
    try {
      const token = obtenerToken();
      const respuesta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/proveedores/${proveedor._id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setError(datos.mensaje);
        return;
      }
      if (datos.advertencia) {
        setAdvertencia(datos.advertencia);
      }
      cargarProveedores();
    } catch {
      setError('No se pudo conectar con el servidor');
    }
  };

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setExito('');
    setAdvertencia('');
    setCargando(true);

    const editando = idEditando !== null;
    const url = editando
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/proveedores/${idEditando}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/proveedores`;

    try {
      const token = obtenerToken();
      const respuesta = await fetch(url, {
        method: editando ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          razonSocial,
          identificacionTributaria,
          categoria,
          contactoNombre,
          telefono,
          emailContacto,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setError(datos.mensaje);
        return;
      }

      setExito(editando ? 'Proveedor actualizado correctamente.' : 'Proveedor registrado correctamente.');
      limpiarFormulario();
      cargarProveedores();
    } catch (err) {
      setError('No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h2 className="h4 mb-4 d-flex align-items-center gap-2">
        <i className="bi bi-building text-primary" />
        Proveedores
      </h2>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white py-3">
          <h6 className="m-0 fw-bold text-primary">
            {idEditando ? 'Editar proveedor' : 'Registrar proveedor'}
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={manejarEnvio}>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="razonSocial" className="form-label">Razón social</label>
                <input
                  id="razonSocial"
                  type="text"
                  className="form-control"
                  value={razonSocial}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRazonSocial(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="identificacionTributaria" className="form-label">Identificación tributaria (NIT)</label>
                <input
                  id="identificacionTributaria"
                  type="text"
                  className="form-control"
                  value={identificacionTributaria}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setIdentificacionTributaria(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="categoria" className="form-label">Categoría</label>
                <select
                  id="categoria"
                  className="form-select"
                  value={categoria}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoria(e.target.value)}
                  required
                >
                  <option value="" disabled>Selecciona una categoría</option>
                  <option value="construcción">construcción</option>
                  <option value="general">general</option>
                </select>
              </div>

              <div className="col-md-6">
                <label htmlFor="contactoNombre" className="form-label">Nombre de contacto</label>
                <input
                  id="contactoNombre"
                  type="text"
                  className="form-control"
                  value={contactoNombre}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setContactoNombre(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="telefono" className="form-label">Teléfono</label>
                <input
                  id="telefono"
                  type="text"
                  className="form-control"
                  value={telefono}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTelefono(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="emailContacto" className="form-label">Correo de contacto</label>
                <input
                  id="emailContacto"
                  type="email"
                  className="form-control"
                  value={emailContacto}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmailContacto(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <div className="alert alert-danger py-2 mt-3">{error}</div>}
            {advertencia && <div className="alert alert-warning py-2 mt-3">{advertencia}</div>}
            {exito && <div className="alert alert-success py-2 mt-3">{exito}</div>}

            <div className="d-flex gap-2 mt-3">
              <button type="submit" className="btn btn-primary px-4" disabled={cargando}>
                {cargando
                  ? 'Guardando...'
                  : idEditando
                  ? 'Guardar cambios'
                  : 'Registrar proveedor'}
              </button>
              {idEditando && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={limpiarFormulario}
                  disabled={cargando}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
          <h6 className="m-0 fw-bold text-primary">Listado de proveedores</h6>
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
          {cargandoLista ? (
            <p className="text-muted mb-0">Cargando…</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Razón social</th>
                    <th>NIT</th>
                    <th>Categoría</th>
                    <th>Contacto</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => (
                    <tr key={p._id} className={!p.activo ? 'table-secondary' : ''}>
                      <td>{p.razonSocial}</td>
                      <td>{p.identificacionTributaria}</td>
                      <td>{p.categoria}</td>
                      <td>{p.contactoNombre}</td>
                      <td>
                        {p.activo ? (
                          <span className="badge bg-success">Activo</span>
                        ) : (
                          <span className="badge bg-secondary">Inactivo</span>
                        )}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary me-2"
                          onClick={() => iniciarEdicion(p)}
                          disabled={!p.activo}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => inactivarProveedor(p)}
                          disabled={!p.activo}
                        >
                          Inactivar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proveedores.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-3">
                        No hay proveedores para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}