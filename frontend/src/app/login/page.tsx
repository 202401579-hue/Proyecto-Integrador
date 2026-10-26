'use client';

import { useCallback, useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { guardarToken } from '@/lib/session';
import { comoRelojito, segundosHastaExpirar, type RespuestaDeLogin } from '@/lib/mfa';
import ConfigurarMfa from '@/components/mfa/ConfigurarMfa';
import VerificarMfa from '@/components/mfa/VerificarMfa';

/**
 * Login en dos pasos (Sprint 5).
 *
 * POST /api/auth/login puede responder tres cosas distintas, todas con 200, y
 * esta pantalla es la que decide qué hacer con cada una:
 *
 *   { token }                            -> hay sesión, se entra
 *   { mfaRequired, tempToken }           -> falta el código del autenticador
 *   { mfaSetupRequired, tempToken }      -> falta configurar el autenticador
 *
 * El token temporal vive solo en el estado de este componente, nunca en
 * localStorage: dura cinco minutos y no sirve para nada más que completar el
 * segundo paso. Si el usuario recarga la página, lo pierde y vuelve a empezar,
 * que es justo lo que se quiere de algo que todavía no es una sesión.
 */

type Paso = 'CREDENCIALES' | 'CONFIGURAR_MFA' | 'VERIFICAR_MFA';

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [paso, setPaso] = useState<Paso>('CREDENCIALES');
  const [tempToken, setTempToken] = useState('');
  const [aviso, setAviso] = useState('');
  const [restante, setRestante] = useState(0);

  const entrar = useCallback(
    (token: string) => {
      guardarToken(token);
      router.replace('/redireccion');
    },
    [router]
  );

  const volverACredenciales = useCallback((mensaje: string) => {
    setPaso('CREDENCIALES');
    setTempToken('');
    setPassword('');
    setError('');
    setAviso(mensaje);
  }, []);

  // Contador del token temporal. Se mira el exp del propio JWT, así que el
  // plazo que se muestra es el que firmó el servidor. Al llegar a cero se
  // vuelve solo al primer paso: sin esto, el usuario se quedaría escribiendo
  // códigos contra un token que ya venció y recibiendo un 401 sin explicación.
  useEffect(() => {
    if (paso === 'CREDENCIALES' || !tempToken) return;

    const medir = () => {
      const segundos = segundosHastaExpirar(tempToken);
      setRestante(segundos);

      if (segundos <= 0) {
        volverACredenciales(
          'Se agotó el tiempo para completar la verificación. Vuelva a iniciar sesión.'
        );
      }
    };

    medir();
    const reloj = setInterval(medir, 1000);
    return () => clearInterval(reloj);
  }, [paso, tempToken, volverACredenciales]);

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setAviso('');
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

      // Las dos respuestas con segundo factor traen el token temporal en vez
      // del de acceso. Se miran antes que datos.token justamente porque en
      // esos casos no viene ningún token de acceso.
      if (datos.tempToken && (datos.mfaSetupRequired || datos.mfaRequired)) {
        setTempToken(datos.tempToken);
        setPaso(datos.mfaSetupRequired ? 'CONFIGURAR_MFA' : 'VERIFICAR_MFA');
        return;
      }

      if (!datos.token) {
        setError('El servidor no devolvió una sesión válida. Intente de nuevo.');
        return;
      }

      entrar(datos.token);
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  };

  const enSegundoPaso = paso !== 'CREDENCIALES';

  return (
    <div className='d-flex justify-content-center align-items-center vh-100 bg-light'>
      <div
        className='card shadow p-4'
        style={{ width: '100%', maxWidth: enSegundoPaso ? '480px' : '400px' }}
      >
        {enSegundoPaso && (
          <div className='d-flex justify-content-between align-items-center small text-muted mb-3'>
            <span>{correo}</span>
            <span>
              <i className='bi bi-clock me-1' />
              {comoRelojito(restante)}
            </span>
          </div>
        )}

        {paso === 'CONFIGURAR_MFA' && (
          <ConfigurarMfa
            tempToken={tempToken}
            correo={correo}
            onConfigurado={() => setPaso('VERIFICAR_MFA')}
            onSesionCaida={volverACredenciales}
          />
        )}

        {paso === 'VERIFICAR_MFA' && (
          <VerificarMfa
            tempToken={tempToken}
            onAutenticado={entrar}
            onSesionCaida={volverACredenciales}
          />
        )}

        {enSegundoPaso && (
          <button
            type='button'
            className='btn btn-link btn-sm w-100 mt-2 text-muted'
            onClick={() => volverACredenciales('')}
          >
            Cancelar e ingresar con otra cuenta
          </button>
        )}

        {paso === 'CREDENCIALES' && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
