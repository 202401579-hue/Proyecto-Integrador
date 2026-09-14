'use client';
import { useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const respuesta = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setError(datos.mensaje ?? 'Credenciales incorrectas');
        return;
      }
      localStorage.setItem('token', datos.token);
      router.replace('/redireccion');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className='d-flex justify-content-center align-items-center vh-100 bg-light'>
      <div className='card shadow p-4' style={{ width: '100%', maxWidth: '400px' }}>
        <h3 className='text-center mb-4'>Iniciar sesión</h3>
        <form onSubmit={manejarEnvio}>
          <div className='mb-3'>
            <label htmlFor='correo' className='form-label'>Correo electrónico</label>
            <input
              id='correo'
              type='email'
              className='form-control'
              value={correo}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCorreo(e.target.value)}
              required
            />
          </div>
          <div className='mb-3'>
            <label htmlFor='password' className='form-label'>Contraseña</label>
            <input
              id='password'
              type='password'
              className='form-control'
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className='alert alert-danger py-2'>{error}</div>}
          <button type='submit' className='btn btn-primary w-100' disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}