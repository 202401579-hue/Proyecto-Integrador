'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { obtenerToken } from '@/lib/session';

interface Parametro {
  _id: string;
  clave: string;
  valor: string;
  descripcion: string;
  activo: boolean;
  usuarioActualizacion?: string;
}

export default function ParametrosPage() {
  const [clave, setClave] = useState('');
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const [idEditando, setIdEditando] = useState<string | null>(null);

  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const cargarParametros = async () => {
    setCargandoLista(true);
    try {
      const token = obtenerToken();
      const query = mostrarInactivos ? '?incluirInactivos=true' : '';
      const respuesta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/parametros${query}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const datos = await respuesta.json();
      setParametros(Array.isArray(datos) ? datos : []);
    } catch {
      setParametros([]);
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarParametros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInactivos]);

  const limpiarFormulario = () => {
    setClave('');
    setValor('');
    setDescripcion('');
    setIdEditando(null);
  };

  const iniciarEdicion = (parametro: Parametro) => {
    setError('');
    setExito('');
    setClave(parametro.clave);
    setValor(parametro.valor);
    setDescripcion(parametro.descripcion);
    setIdEditando(parametro._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inactivarParametro = async (parametro: Parametro) => {
    const confirmar = window.confirm(
      `¿Inactivar el parámetro "${parametro.clave}"? El backend seguirá funcionando con su valor por defecto.`
    );
    if (!confirmar) return;

    setError('');
    try {
      const token = obtenerToken();
      const respuesta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/parametros/${parametro._id}`,
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
      cargarParametros();
    } catch {
      setError('No se pudo conectar con el servidor');
    }
  };

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setExito('');
    setCargando(true);

    const editando = idEditando !== null;
    const url = editando
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/parametros/${idEditando}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/parametros`;

    try {
      const token = obtenerToken();
      const respuesta = await fetch(url, {
        method: editando ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clave,
          valor: String(valor),
          descripcion,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setError(datos.mensaje);
        return;
      }

      setExito(editando ? 'Parámetro actualizado correctamente.' : 'Parámetro creado correctamente.');
      limpiarFormulario();
      cargarParametros();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <h2 className="h4 mb-4 d-flex align-items-center gap-2">
        <i className="bi bi-sliders text-primary" />
        Parámetros
      </h2>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white py-3">
          <h6 className="m-0 fw-bold text-primary">
            {idEditando ? 'Editar parámetro' : 'Nuevo parámetro'}
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={manejarEnvio}>
            <div className="row g-3">
              <div className="col-md-4">
                <label htmlFor="clave" className="form-label">Clave</label>
                <input
                  id="clave"
                  type="text"
                  className="form-control"
                  value={clave}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setClave(e.target.value)}
                  disabled={idEditando !== null}
                  required
                />
              </div>

              <div className="col-md-3">
                <label htmlFor="valor" className="form-label">Valor</label>
                <input
                  id="valor"
                  type="text"
                  className="form-control"
                  value={valor}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setValor(e.target.value)}
                  required
                />
                <div className="form-text">Siempre como texto (ej. "17").</div>
              </div>

              <div className="col-md-5">
                <label htmlFor="descripcion" className="form-label">Descripción</label>
                <input
                  id="descripcion"
                  type="text"
                  className="form-control"
                  value={descripcion}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDescripcion(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <div className="alert alert-danger py-2 mt-3">{error}</div>}
            {exito && <div className="alert alert-success py-2 mt-3">{exito}</div>}

            <div className="d-flex gap-2 mt-3">
              <button type="submit" className="btn btn-primary px-4" disabled={cargando}>
                {cargando ? 'Guardando...' : idEditando ? 'Guardar cambios' : 'Crear parámetro'}
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
          <h6 className="m-0 fw-bold text-primary">Listado de parámetros</h6>
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
                    <th>Clave</th>
                    <th>Valor</th>
                    <th>Descripción</th>
                    <th>Modificado por</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parametros.map((p) => (
                    <tr key={p._id} className={!p.activo ? 'table-secondary' : ''}>
                      <td>{p.clave}</td>
                      <td>{p.valor}</td>
                      <td>{p.descripcion}</td>
                      <td>{p.usuarioActualizacion ?? '—'}</td>
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
                          onClick={() => inactivarParametro(p)}
                          disabled={!p.activo}
                        >
                          Inactivar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {parametros.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-3">
                        No hay parámetros para mostrar.
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