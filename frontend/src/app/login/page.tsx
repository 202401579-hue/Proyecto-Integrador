'use client';

import { Suspense, useCallback, useState, ChangeEvent, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { guardarToken } from '@/lib/session';
import { borrarTokenTemporal, guardarTokenTemporal } from '@/lib/mfaTemp';
import type { RespuestaDeLogin } from '@/lib/mfa';
import MfaSetupModal from '@/components/mfa/MfaSetupModal';

/**
 * Login en dos pasos (Sprint 5).
 *
 * POST /api/auth/login responde una de tres cosas, todas con 200, y esta
 * pantalla decide qué hacer con cada una:
 *
 *   { token }                        -> hay sesión, se entra
 *   { mfaRequired, tempToken }       -> a /login/mfa a poner el código
 *   { mfaSetupRequired, tempToken }  -> se abre el modal de enrolamiento
 *
 * Los dos casos con segundo factor guardan el token temporal con
 * lib/mfaTemp.ts, nunca en la clave de la sesión.
 */

function FormularioDeLogin() {
  const router = useRouter();
  const parametros = useSearchParams();

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mostrarSetup, setMostrarSetup] = useState(false);

  // /login/mfa manda de vuelta acá con un aviso cuando el token temporal
  // vence o se agotan los intentos. Viaja en la URL porque es lo único que
  // sobrevive a la navegación una vez que el temporal ya se borró.
  const aviso = parametros.get('aviso');

  // Estables, porque el modal las mira en un efecto.
  const cerrarSetup = useCallback(() => {
    borrarTokenTemporal();
    setMostrarSetup(false);
  }, []);

  const caidaDelSetup = useCallback((mensaje: string) => {
    borrarTokenTemporal();
    setMostrarSetup(false);
    setError(mensaje);
  }, []);

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
      const datos: RespuestaDeLogin = await respuesta.json();
      if (!respuesta.ok) {
        setError(datos.mensaje ?? 'Credenciales incorrectas');
        return;
      }

      // Las dos respuestas con segundo factor se miran ANTES que datos.token:
      // en esos casos no viene ningún token de acceso, y guardarlo a ciegas
      // escribiría "undefined" en la clave de la sesión.
      if (datos.tempToken && datos.mfaRequired) {
        guardarTokenTemporal(datos.tempToken);
        router.push('/login/mfa');
        return;
      }

      if (datos.tempToken && datos.mfaSetupRequired) {
        guardarTokenTemporal(datos.tempToken);
        setMostrarSetup(true);
        return;
      }

      if (!datos.token) {
        setError('El servidor no devolvió una sesión válida. Intente de nuevo.');
        return;
      }

      guardarToken(datos.token);
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

        {aviso && <div className='alert alert-warning py-2'>{aviso}</div>}

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

      {/* El enrolamiento se muestra encima del login, sin navegar: el usuario
          todavía no tiene sesión y, si cancela, queda donde estaba. Una vez
          configurado, el token temporal todavía sirve, así que se pasa a
          /login/mfa a usarlo. */}
      {mostrarSetup && (
        <MfaSetupModal
          correo={correo}
          onConfigurado={() => router.push('/login/mfa')}
          onSesionCaida={caidaDelSetup}
          onCancelar={cerrarSetup}
        />
      )}
    </div>
  );
}

/**
 * useSearchParams obliga a una frontera de Suspense para que la página se
 * pueda prerrenderizar en el build.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <FormularioDeLogin />
    </Suspense>
  );
}
