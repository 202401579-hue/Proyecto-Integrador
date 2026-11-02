import { Request, Response } from 'express';
import Usuario, { IUsuario } from '../models/Usuario';
import { filtroActivos } from '../services/borradoLogico';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';
import { nombreDelUsuario } from '../services/usuarioAuditoria';

/**
 * Administracion de usuarios (Sprint 5).
 *
 * Todo este modulo es del rol Administrador: crear cuentas, cambiarles el
 * rol, darlas de baja y exigirles el segundo factor son decisiones sobre
 * quien puede entrar al sistema y con que permisos.
 *
 * Ninguna respuesta de este controlador incluye el hash de la contrasena,
 * el secreto del segundo factor ni los codigos de recuperacion. No hace
 * falta filtrarlos a mano: los tres campos tienen select: false y, ademas,
 * el modelo los borra al serializar a JSON (ver models/Usuario.ts).
 */

const MENSAJE_DUPLICADO = 'Ya existe un usuario con ese correo';
const MENSAJE_NO_ENCONTRADO = 'El usuario indicado no existe o está inactivo';

/** Minimo que pide el enunciado para una contrasena nueva. */
export const LARGO_MINIMO_PASSWORD = 8;

/**
 * Valida el largo de la contrasena. Devuelve true si ya respondio.
 *
 * El minimo se comprueba aca y no en el esquema a proposito: es una regla
 * de este endpoint, no del modelo. Los usuarios sembrados por npm run seed
 * vienen del Sprint 0 con claves mas cortas, y ponerle minlength al
 * esquema dejaria al seed sin poder correr y al banco de pruebas
 * funcionales sin con que autenticarse.
 */
const respondioPasswordInvalida = (password: unknown, res: Response): boolean => {
  if (typeof password === 'string' && password.length >= LARGO_MINIMO_PASSWORD) {
    return false;
  }

  res.status(400).json({
    mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`
  });
  return true;
};

/**
 * Comprueba que quien pide cambiar mfaObligatorio sea Administrador.
 * Devuelve true si ya respondio.
 *
 * La ruta ya exige ese rol, asi que esta comprobacion nunca deberia
 * dispararse. Se escribe igual porque el enunciado la pide de forma
 * explicita y porque es barata: si manana alguien monta este controlador
 * en otra ruta, o afloja el middleware, la regla sigue valiendo donde esta
 * escrita la regla y no donde esta escrito el router.
 */
const respondioSinPermisoDeMfa = (req: Request, res: Response): boolean => {
  if (req.usuario?.rol === 'Administrador') {
    return false;
  }

  res.status(403).json({
    mensaje: 'Solo un Administrador puede cambiar la exigencia de verificación en dos pasos'
  });
  return true;
};

/** true si el administrador esta operando sobre su propia cuenta. */
const esSuPropiaCuenta = (req: Request, id: string): boolean => req.usuario?.id === id;

/**
 * GET /api/usuarios
 *
 * Devuelve los usuarios ACTIVOS, ordenados por nombre. Los dados de baja
 * no salen, salvo que se pida ?incluirInactivos=true.
 */
export const listarUsuarios = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuarios = await Usuario.find(filtroActivos<IUsuario>(req)).sort({ nombre: 1 });
    res.status(200).json(usuarios);
  } catch (error) {
    console.error('[Usuarios] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/usuarios/:id
 *
 * Mismo criterio que el listado: un usuario inactivo solo se ve con
 * ?incluirInactivos=true.
 */
export const obtenerUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del usuario')) {
      return;
    }

    const usuario = await Usuario.findOne({ _id: id, ...filtroActivos<IUsuario>(req) });

    if (!usuario) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    res.status(200).json(usuario);
  } catch (error) {
    console.error('[Usuarios] Error al obtener:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/usuarios
 *
 * Recibe { nombre, correo, password, rol, mfaObligatorio? } y devuelve el
 * usuario creado (201), sin la contrasena.
 *
 * El hash lo hace el hook pre('save') del modelo, no este controlador: asi
 * ninguna via de alta puede guardar una contrasena en texto plano por
 * olvidarse de hashearla.
 */
export const crearUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, correo, password, rol, mfaObligatorio } = req.body ?? {};

    if (respondioPasswordInvalida(password, res)) {
      return;
    }

    if (mfaObligatorio !== undefined && respondioSinPermisoDeMfa(req, res)) {
      return;
    }

    // Se avisa antes de intentar la escritura para dar un mensaje claro.
    // El indice unico del correo sigue siendo la red final: dos altas
    // simultaneas pueden pasar las dos por este chequeo.
    //
    // La busqueda NO filtra por activo: un usuario dado de baja conserva su
    // correo, y reutilizarlo dejaria dos cuentas con el mismo login.
    const yaExiste = await Usuario.findOne({
      correo: String(correo ?? '').toLowerCase().trim()
    });

    if (yaExiste) {
      res.status(409).json({ mensaje: MENSAJE_DUPLICADO });
      return;
    }

    // Se arma el objeto campo por campo para que un cliente no pueda colar
    // propiedades extra: ni activo, ni twoFactorEnabled, ni mucho menos
    // twoFactorSecret o los codigos de recuperacion.
    const usuario = await Usuario.create({
      nombre,
      correo,
      password,
      rol,
      mfaObligatorio: mfaObligatorio === true,
      usuarioCreacion: await nombreDelUsuario(req)
    });

    res.status(201).json(usuario);
  } catch (error) {
    // Campos faltantes, rol fuera del enum, correo mal formado o repetido:
    // los traduce el servicio compartido (ver services/respuestasError.ts).
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Usuarios] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/usuarios/:id
 *
 * Todos los campos son opcionales: solo se toca lo que vino en el body.
 * Si viene password, el hook del modelo la vuelve a hashear.
 *
 * Se busca el documento y se guarda con save() en lugar de usar
 * findByIdAndUpdate: asi corren las validaciones del esquema y, sobre
 * todo, el hook que hashea la contrasena, que findByIdAndUpdate se saltea
 * y dejaria la clave guardada en texto plano.
 */
export const actualizarUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del usuario')) {
      return;
    }

    const usuario = await Usuario.findOne({ _id: id, activo: true });

    if (!usuario) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    const { nombre, correo, password, rol, mfaObligatorio } = req.body ?? {};

    if (password !== undefined && respondioPasswordInvalida(password, res)) {
      return;
    }

    if (mfaObligatorio !== undefined && respondioSinPermisoDeMfa(req, res)) {
      return;
    }

    // Un administrador no puede dejar de serlo a si mismo. Si fuera el
    // unico, el sistema se quedaria sin nadie que pueda crear usuarios ni
    // devolverle el rol, y habria que arreglarlo entrando a la base a mano.
    if (rol !== undefined && rol !== 'Administrador' && esSuPropiaCuenta(req, String(id))) {
      res.status(409).json({
        mensaje:
          'No puede quitarse a sí mismo el rol de Administrador. ' +
          'Pídale el cambio a otro administrador.'
      });
      return;
    }

    if (correo !== undefined) {
      const correoNormalizado = String(correo).toLowerCase().trim();
      const otro = await Usuario.findOne({
        correo: correoNormalizado,
        _id: { $ne: usuario._id }
      });

      if (otro) {
        res.status(409).json({ mensaje: MENSAJE_DUPLICADO });
        return;
      }

      usuario.correo = correoNormalizado;
    }

    if (nombre !== undefined) {
      usuario.nombre = nombre;
    }

    if (rol !== undefined) {
      usuario.rol = rol;
    }

    // Cambiar mfaObligatorio a false NO desactiva el segundo factor de
    // quien ya lo tiene andando: twoFactorEnabled no se toca aca. La
    // exigencia y el hecho de tenerlo configurado son dos cosas distintas,
    // y apagarle el autenticador a alguien porque dejo de ser obligatorio
    // seria bajarle la seguridad sin que nadie lo haya pedido. Para quitarlo
    // de verdad esta POST /api/usuarios/:id/mfa/reiniciar.
    if (mfaObligatorio !== undefined) {
      usuario.mfaObligatorio = mfaObligatorio === true;
    }

    // El hook pre('save') detecta que cambio y la hashea.
    if (password !== undefined) {
      usuario.password = password;
    }

    usuario.usuarioActualizacion = await nombreDelUsuario(req);

    await usuario.save();

    res.status(200).json(usuario);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Usuarios] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/usuarios/:id
 *
 * Borrado logico: pasa activo a false. El documento no se borra, asi la
 * auditoria de las otras colecciones sigue resolviendo quien hizo cada
 * operacion. El login de esa cuenta responde 403 desde ese momento.
 */
export const inactivarUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del usuario')) {
      return;
    }

    // Misma razon que en el cambio de rol: el administrador que se da de
    // baja a si mismo pierde el acceso en el acto y, si era el unico, deja
    // al sistema sin forma de crear otro.
    if (esSuPropiaCuenta(req, String(id))) {
      res.status(409).json({
        mensaje:
          'No puede darse de baja a sí mismo. Pídale la baja a otro administrador.'
      });
      return;
    }

    const usuario = await Usuario.findOne({ _id: id, activo: true });

    // Si ya estaba inactivo se responde igual que si no existiera: para el
    // cliente el resultado es el mismo y no hay nada que dar de baja.
    if (!usuario) {
      res.status(404).json({ mensaje: 'El usuario indicado no existe o ya está inactivo' });
      return;
    }

    usuario.activo = false;
    usuario.usuarioActualizacion = await nombreDelUsuario(req);

    await usuario.save();

    res.status(200).json({ mensaje: 'Usuario inactivado', usuario });
  } catch (error) {
    console.error('[Usuarios] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/usuarios/:id/mfa/reiniciar
 *
 * Borra el secreto y los codigos de recuperacion y deja twoFactorEnabled
 * en false, de modo que el usuario vuelva a configurar el segundo factor
 * desde cero en su proximo inicio de sesion.
 *
 * Es la salida para quien perdio el telefono: sin esto, un usuario con MFA
 * activado y sin acceso a su autenticador quedaria afuera del sistema para
 * siempre, porque todos los caminos para recuperarlo pasan por tener el
 * autenticador. Tambien es lo que permite repetir la demostracion.
 *
 * No toca mfaObligatorio: si el administrador se lo exigia, se lo sigue
 * exigiendo, y el proximo login lo va a mandar derecho a configurarlo.
 */
export const reiniciarMfaDeUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del usuario')) {
      return;
    }

    // Se piden los dos campos ocultos porque hay que escribirlos: Mongoose
    // no deja modificar una ruta que no fue seleccionada.
    const usuario = await Usuario.findOne({ _id: id, activo: true }).select(
      '+twoFactorSecret +twoFactorRecoveryCodes'
    );

    if (!usuario) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    const teniaMfaActivado = usuario.twoFactorEnabled;

    usuario.twoFactorSecret = undefined;
    usuario.twoFactorRecoveryCodes = [];
    usuario.twoFactorEnabled = false;
    usuario.usuarioActualizacion = await nombreDelUsuario(req);

    await usuario.save();

    res.status(200).json({
      mensaje: teniaMfaActivado
        ? 'Verificación en dos pasos reiniciada. El usuario deberá configurarla de nuevo.'
        : 'El usuario no tenía la verificación en dos pasos activada; quedó limpia igual.',
      usuario,
      // Se dice explicitamente porque es la pregunta que sigue: reiniciar
      // no levanta la exigencia.
      mfaObligatorio: usuario.mfaObligatorio
    });
  } catch (error) {
    console.error('[Usuarios] Error al reiniciar el MFA:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
