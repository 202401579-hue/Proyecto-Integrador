import { Request, Response } from 'express';
import Usuario from '../models/Usuario';
import { decidirPasoDeLogin } from '../services/login';
import { firmarTokenDeAcceso, firmarTokenTemporal, obtenerSecreto } from '../services/tokens';

/**
 * POST /api/auth/login
 *
 * Recibe { correo, password } y, segun el estado del segundo factor del
 * usuario, devuelve una de estas TRES respuestas, todas con estado 200:
 *
 *   { token }                            sesion abierta, nada mas que hacer
 *   { mfaRequired: true, tempToken }     falta escribir el codigo
 *   { mfaSetupRequired: true, tempToken } falta configurar el autenticador
 *
 * El frontend tiene que mirar cual de las tres llego: guardar
 * respuesta.token a ciegas, como se hacia hasta el Sprint 4, deja la
 * sesion rota en silencio en los dos casos nuevos.
 *
 * La decision de cual corresponde esta en services/login.ts, en una
 * funcion pura que se prueba sola.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // El ?? {} evita un TypeError si el cuerpo no llego parseado.
    // Pasa cuando el cliente no manda la cabecera Content-Type: application/json:
    // express.json() no lo procesa y req.body queda undefined. Sin esta guarda
    // la peticion terminaria en un 500, cuando en realidad es un error del cliente.
    const { correo, password } = req.body ?? {};

    if (!correo || !password) {
      res.status(400).json({ mensaje: 'El correo y la contraseña son obligatorios' });
      return;
    }

    // Se pide el password explicitamente porque el esquema lo marca
    // como select: false y no viene en las consultas normales.
    // mfaObligatorio y twoFactorEnabled si vienen solos: no son secretos,
    // y el secreto del autenticador no hace falta todavia.
    const usuario = await Usuario.findOne({
      correo: String(correo).toLowerCase().trim()
    }).select('+password');

    // Mismo mensaje generico para "el correo no existe" y para
    // "la contrasena no coincide". Distinguirlos le permitiria a un
    // atacante averiguar que correos estan registrados en el sistema.
    if (!usuario) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' });
      return;
    }

    const passwordCorrecta = await usuario.compararPassword(password);

    if (!passwordCorrecta) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' });
      return;
    }

    // La baja se comprueba DESPUES de la contrasena, no antes. Si fuera al
    // reves, cualquiera podria averiguar que cuentas estan dadas de baja
    // probando correos sueltos; asi, solo se entera quien ya demostro ser
    // el dueno de la cuenta, y para esa persona el aviso es util.
    //
    // Se compara contra false y no con un ! : en una base sembrada antes
    // del Sprint 5 el campo todavia puede no existir, y con ! esos
    // usuarios quedarian bloqueados sin que nadie los haya dado de baja.
    if (usuario.activo === false) {
      res.status(403).json({
        mensaje: 'La cuenta está inactiva. Comuníquese con el administrador.'
      });
      return;
    }

    const secreto = obtenerSecreto();

    if (!secreto) {
      res.status(500).json({ mensaje: 'Error interno del servidor' });
      return;
    }

    const paso = decidirPasoDeLogin({
      mfaObligatorio: usuario.mfaObligatorio,
      twoFactorEnabled: usuario.twoFactorEnabled
    });

    // Sin segundo factor de por medio: el login termina aca, exactamente
    // igual que antes del Sprint 5. Es lo que mantiene andando al frontend
    // actual, al banco de pruebas funcionales y a la demostracion.
    if (paso === 'ACCESO_DIRECTO') {
      const token = firmarTokenDeAcceso(
        {
          id: String(usuario._id),
          correo: usuario.correo,
          rol: usuario.rol
        },
        secreto
      );

      res.status(200).json({ token });
      return;
    }

    // Los otros dos casos entregan el token TEMPORAL. No abre ninguna ruta
    // operativa (verificarToken lo rechaza con 403): solo sirve para
    // alcanzar /api/mfa y /api/auth/mfa/verify-login, y dura cinco minutos.
    const { token: tempToken } = firmarTokenTemporal(String(usuario._id), secreto);

    if (paso === 'VERIFICAR_MFA') {
      res.status(200).json({ mfaRequired: true, tempToken });
      return;
    }

    // CONFIGURAR_MFA: el administrador le exige el segundo factor y el
    // usuario todavia no lo armo. Entra al sistema solo para eso.
    res.status(200).json({ mfaSetupRequired: true, tempToken });
  } catch (error) {
    console.error('[Auth] Error en el login:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
