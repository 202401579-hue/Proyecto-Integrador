'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { obtenerToken } from '@/lib/session';

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

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setExito('');
    setCargando(true);

    try {
      const token = obtenerToken();
      const respuesta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/proveedores`, {
        method: 'POST',
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

      setExito('Proveedor registrado correctamente.');
      setRazonSocial('');
      setIdentificacionTributaria('');
      setCategoria('');
      setContactoNombre('');
      setTelefono('');
      setEmailContacto('');
    } catch (err) {
      setError('No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="d-flex justify-content-center">
      <div className="w-100 mt-4" style={{ maxWidth: '600px' }}>
        <h2 className="mb-4">Registro de proveedores</h2>
        <div className="card shadow-sm p-4">
          <form onSubmit={manejarEnvio}>
            <div className="mb-3">
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

            <div className="mb-3">
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

            <div className="mb-3">
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

            <div className="mb-3">
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

            <div className="mb-3">
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

            <div className="mb-3">
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

            {error && <div className="alert alert-danger py-2">{error}</div>}
            {exito && <div className="alert alert-success py-2">{exito}</div>}

            <button type="submit" className="btn btn-primary w-100" disabled={cargando}>
              {cargando ? 'Guardando...' : 'Registrar proveedor'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}