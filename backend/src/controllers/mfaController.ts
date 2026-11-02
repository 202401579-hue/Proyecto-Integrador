import { Request, Response } from 'express';
import Usuario, { IUsuario } from '../models/Usuario';
import {
  LIMITE_DE_INTENTOS,
  olvidarIntentos,
  registrarIntentoFallido,
  superoElLimite
} from '../services/intentosMfa';
import {
  construirOtpauthUrl,
  esFormatoDeCodigoDeRecuperacion,
  esFormatoDeCodigoValido,
  generarCodigosDeRecuperacion,
  generarSecreto,
  hashearCodigosDeRecuperacion,
  normalizarCodigo,
  posicionDelCodigoDeRecuperacion,
  verificarCodigoTotp
} from '../services/mfa';
import { firmarTokenDeAcceso, obtenerSecreto } from '../services/tokens';

/**
 * Configuracion y verificacion del segundo factor.
 *
 * Las tres rutas de este controlador van detras de verifyTempToken, nunca
 * de verificarToken. Es al reves de lo que parece intuitivo, y tiene que
 * ser asi: a estas rutas hay que poder entrar SIN tener todavia un token
 * de acceso. Si pidieran uno, un usuario con MFA obligatorio sin
 * configurar no podria configurarlo nunca, porque para obtener el token de
 * acceso primero tendria que pasar el segundo factor que todavia no tiene.
 */

const MENSAJE_SIN_INTENTOS =
  'Demasiados códigos incorrectos. Vuelva a iniciar sesión para intentar de nuevo.';

const MENSAJE_SIN_TOKEN_TEMPORAL =
  'Se requiere el token temporal obtenido al iniciar sesión.';

/**
 * Trae al usuario del token temporal, o responde y devuelve null.
 *
 * Los tres endpoints empiezan igual: el token dice quien es, pero entre el
 * login y este momento pudieron pasar cinco minutos, y en cinco minutos el
 * administrador puede haber dado de baja la cuenta.
 */
const usuarioDelTokenTemporal = async (
  req: Request,
  res: Response,
  campos: string
): Promise<IUsuario | null> => {
  const usuario = await Usuario.findById(req.usuarioTemporal?.id).select(campos);

  if (!usuario) {
    res.status(401).json({ mensaje: 'El usuario del token temporal ya no existe.' });
    return null;
  }

  if (usuario.activo === false) {
    res.status(403).json({
      mensaje: 'La cuenta está inactiva. Comuníquese con el administrador.'
    });
    return null;
  }

  return usuario;
};

/**
 * POST /api/mfa/setup
 *
 * Genera el secreto y devuelve con que configurarlo: la URI otpauth://
 * para armar el QR y el mismo secreto en Base32 para escribirlo a mano
 * cuando la camara no coopera.
 *
 * El secreto se guarda pero twoFactorEnabled sigue en false: todavia no
 * hay ninguna prueba de que el usuario haya llegado a cargarlo en su
 * telefono. Activarlo aca dejaria afuera del sistema a cualquiera que
 * cierre la pantalla del QR antes de escanearlo.
 *
 * Llamarlo otra vez regenera el secreto, y esa es la salida cuando algo
 * salio mal a mitad de la configuracion.
 */
export const configurarMfa = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario = await usuarioDelTokenTemporal(req, res, '+twoFactorSecret');

    if (!usuario) {
      return;
    }

    // Con el MFA ya activo, regenerar el secreto romperia el autenticador
    // que el usuario tiene funcionando. Para ese caso esta el reinicio del
    // administrador (POST /api/usuarios/:id/mfa/reiniciar).
    if (usuario.twoFactorEnabled) {
      res.status(400).json({
        mensaje:
          'La verificación en dos pasos ya está activada. ' +
          'Para volver a configurarla, pida al administrador que la reinicie.'
      });
      return;
    }

    const secreto = generarSecreto();

    usuario.twoFactorSecret = secreto;
    // Si quedaban codigos de una configuracion anterior que no se llego a
    // activar, dejan de servir: pertenecian al secreto que se acaba de
    // reemplazar.
    usuario.twoFactorRecoveryCodes = [];
    usuario.usuarioActualizacion = usuario.nombre;

    await usuario.save();

    res.status(200).json({
      mensaje:
        'Escanee el código QR con su aplicación autenticadora y luego confirme ' +
        'un código en /api/mfa/enable.',
      // Lo que se convierte en QR del lado del frontend. Lleva el secreto
      // adentro, asi que se entrega aca y no vuelve a aparecer en ningun lado.
      otpauthUrl: construirOtpauthUrl(secreto, usuario.correo),
      // El mismo secreto, para cargarlo a mano.
      secretoBase32: secreto
    });
  } catch (error) {
    console.error('[MFA] Error en el setup:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/mfa/enable   body: { codigo }
 *
 * Confirma que el usuario cargo bien el secreto en su telefono y recien
 * ahi activa el segundo factor. Devuelve los codigos de recuperacion UNA
 * sola vez: en la base quedan solo sus hashes, asi que no hay forma de
 * volver a mostrarlos.
 *
 * No emite el token definitivo a proposito. El usuario acaba de demostrar
 * que tiene el autenticador, pero el enunciado pide que la sesion se abra
 * en /login/mfa con un codigo nuevo: asi el primer uso real del segundo
 * factor es el mismo flujo que va a usar todos los dias.
 */
export const activarMfa = async (req: Request, res: Response): Promise<void> => {
  try {
    const temporal = req.usuarioTemporal;

    if (!temporal) {
      res.status(401).json({ mensaje: MENSAJE_SIN_TOKEN_TEMPORAL });
      return;
    }

    const usuario = await usuarioDelTokenTemporal(req, res, '+twoFactorSecret');

    if (!usuario) {
      return;
    }

    if (usuario.twoFactorEnabled) {
      res.status(400).json({ mensaje: 'La verificación en dos pasos ya está activada.' });
      return;
    }

    if (!usuario.twoFactorSecret) {
      res.status(400).json({
        mensaje: 'Primero genere el secreto con POST /api/mfa/setup.'
      });
      return;
    }

    // El limite se comprueba ANTES que nada: si ya se agoto, ningun codigo
    // sirve, ni siquiera el correcto.
    if (superoElLimite(temporal.jti)) {
      res.status(429).json({ mensaje: MENSAJE_SIN_INTENTOS });
      return;
    }

    const { codigo } = req.body ?? {};

    // Un codigo mal formado NO gasta un intento: equivocarse de campo o
    // mandar el formulario vacio no es un ataque de fuerza bruta, y
    // cobrarselo al usuario lo dejaria afuera por un error de tipeo.
    if (!esFormatoDeCodigoValido(codigo)) {
      res.status(400).json({ mensaje: 'El código debe tener exactamente 6 dígitos.' });
      return;
    }

    if (!verificarCodigoTotp(usuario.twoFactorSecret, normalizarCodigo(codigo))) {
      const restantes = registrarIntentoFallido(temporal.jti, temporal.exp ?? 0);
      res.status(401).json({
        mensaje: 'El código no es correcto. Verifique la hora de su dispositivo.',
        intentosRestantes: restantes
      });
      return;
    }

    // Codigo correcto: recien ahora se activa el segundo factor.
    const codigosEnClaro = generarCodigosDeRecuperacion();

    usuario.twoFactorEnabled = true;
    usuario.twoFactorRecoveryCodes = await hashearCodigosDeRecuperacion(codigosEnClaro);
    usuario.usuarioActualizacion = usuario.nombre;

    await usuario.save();

    olvidarIntentos(temporal.jti);

    res.status(200).json({
      mensaje:
        'Verificación en dos pasos activada. Guarde los códigos de recuperación: ' +
        'no se vuelven a mostrar.',
      // Unica vez que estos codigos existen en texto plano fuera del
      // telefono del usuario. En la base solo quedan los hashes.
      codigosDeRecuperacion: codigosEnClaro,
      // El enunciado lo pide asi: para abrir sesion hay que pedir un codigo
      // nuevo en el paso de verificacion.
      siguientePaso: 'Inicie sesión y confirme un código en POST /api/auth/mfa/verify-login.'
    });
  } catch (error) {
    console.error('[MFA] Error al activar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/auth/mfa/verify-login   body: { codigo }
 *
 * Ultimo paso del login: valida el codigo y recien entonces emite el token
 * de acceso definitivo. Es el unico lugar, junto con el login sin MFA,
 * donde se firma un token que abre las rutas operativas.
 *
 * Acepta tambien un codigo de recuperacion, que se consume al usarse.
 */
export const verificarLoginConMfa = async (req: Request, res: Response): Promise<void> => {
  try {
    const temporal = req.usuarioTemporal;

    if (!temporal) {
      res.status(401).json({ mensaje: MENSAJE_SIN_TOKEN_TEMPORAL });
      return;
    }

    const usuario = await usuarioDelTokenTemporal(
      req,
      res,
      '+twoFactorSecret +twoFactorRecoveryCodes'
    );

    if (!usuario) {
      return;
    }

    if (!usuario.twoFactorEnabled || !usuario.twoFactorSecret) {
      res.status(400).json({
        mensaje: 'Este usuario no tiene activada la verificación en dos pasos.'
      });
      return;
    }

    if (superoElLimite(temporal.jti)) {
      res.status(429).json({ mensaje: MENSAJE_SIN_INTENTOS });
      return;
    }

    const { codigo } = req.body ?? {};
    const esTotp = esFormatoDeCodigoValido(codigo);
    const esRecuperacion = esFormatoDeCodigoDeRecuperacion(codigo);

    if (!esTotp && !esRecuperacion) {
      res.status(400).json({
        mensaje:
          'El código debe tener exactamente 6 dígitos, ' +
          'o ser un código de recuperación con el formato XXXXX-XXXXX.'
      });
      return;
    }

    const codigoNormalizado = normalizarCodigo(codigo);
    let usoCodigoDeRecuperacion = false;

    if (esTotp) {
      if (!verificarCodigoTotp(usuario.twoFactorSecret, codigoNormalizado)) {
        const restantes = registrarIntentoFallido(temporal.jti, temporal.exp ?? 0);
        res.status(401).json({
          mensaje: 'El código no es correcto. Verifique la hora de su dispositivo.',
          intentosRestantes: restantes
        });
        return;
      }
    } else {
      const posicion = await posicionDelCodigoDeRecuperacion(
        codigoNormalizado,
        usuario.twoFactorRecoveryCodes
      );

      if (posicion === -1) {
        const restantes = registrarIntentoFallido(temporal.jti, temporal.exp ?? 0);
        res.status(401).json({
          mensaje: 'El código de recuperación no es válido o ya fue utilizado.',
          intentosRestantes: restantes
        });
        return;
      }

      // Se consume: un codigo de recuperacion sirve una sola vez. Si
      // quedara disponible seria una contrasena permanente que saltea el
      // segundo factor, justo lo contrario de lo que se busca.
      usuario.twoFactorRecoveryCodes.splice(posicion, 1);
      usuario.usuarioActualizacion = usuario.nombre;
      await usuario.save();

      usoCodigoDeRecuperacion = true;
    }

    const secreto = obtenerSecreto();

    if (!secreto) {
      res.status(500).json({ mensaje: 'Error interno del servidor' });
      return;
    }

    olvidarIntentos(temporal.jti);

    const token = firmarTokenDeAcceso(
      {
        id: String(usuario._id),
        correo: usuario.correo,
        rol: usuario.rol
      },
      secreto
    );

    const respuesta: Record<string, unknown> = { token };

    // Avisar cuantos quedan es parte de que los codigos sirvan: quien gasta
    // el ultimo sin enterarse se queda sin red la proxima vez que pierda el
    // telefono.
    if (usoCodigoDeRecuperacion) {
      const quedan = usuario.twoFactorRecoveryCodes.length;
      respuesta.avisoRecuperacion =
        `Entró con un código de recuperación. Le quedan ${quedan} sin usar.`;
    }

    res.status(200).json(respuesta);
  } catch (error) {
    console.error('[MFA] Error al verificar el login:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/** Se reexporta para que las pruebas nombren el limite sin repetir el numero. */
export { LIMITE_DE_INTENTOS };
