import { Request, Response } from 'express';
import Usuario, { IUsuario } from '../models/Usuario';
import Role from '../models/Role';
import { filtroActivos } from '../services/borradoLogico';
import { registrarEvento } from '../services/eventos';
import { ErrorRolesUsuario, validarRolesActivos } from '../services/roles';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';
import { nombreDelUsuario } from '../services/usuarioAuditoria';

const MENSAJE_DUPLICADO = 'Ya existe un usuario con ese correo';
const MENSAJE_NO_ENCONTRADO = 'El usuario indicado no existe o está inactivo';
export const LARGO_MINIMO_PASSWORD = 8;

const respondioPasswordInvalida = (password: unknown, res: Response): boolean => {
  if (typeof password === 'string' && password.length >= LARGO_MINIMO_PASSWORD) return false;
  res.status(400).json({ mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` });
  return true;
};

const esSuPropiaCuenta = (req: Request, id: string): boolean => req.usuario?.id === id;

const nombresDeRoles = async (roles: IUsuario['roles']): Promise<string[]> => {
  const encontrados = await Role.find({ _id: { $in: roles } }).select('nombreRol').lean();
  return encontrados.map((rol) => rol.nombreRol);
};

const respuestaErrorUsuario = (error: unknown, res: Response): boolean => {
  if (error instanceof ErrorRolesUsuario) {
    res.status(400).json({ mensaje: error.message });
    return true;
  }

  return respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO });
};

/** GET /api/usuarios */
export const listarUsuarios = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuarios = await Usuario.find(filtroActivos<IUsuario>(req))
      .sort({ nombre: 1 })
      .populate('roles', '_id nombreRol');
    res.status(200).json(usuarios);
  } catch (error) {
    console.error('[Usuarios] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/** GET /api/usuarios/:id */
export const obtenerUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (respondioIdInvalido(id, res, 'del usuario')) return;

    const usuario = await Usuario.findOne({ _id: id, ...filtroActivos<IUsuario>(req) }).populate(
      'roles',
      '_id nombreRol'
    );
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

/** POST /api/usuarios: recibe roles: string[] de roles activos. */
export const crearUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, correo, password, roles, mfaObligatorio } = req.body ?? {};
    if (respondioPasswordInvalida(password, res)) return;

    const rolesAsignados = await validarRolesActivos(roles);
    const correoNormalizado = String(correo ?? '').toLowerCase().trim();
    const yaExiste = await Usuario.findOne({ correo: correoNormalizado });
    if (yaExiste) {
      res.status(409).json({ mensaje: MENSAJE_DUPLICADO });
      return;
    }

    const usuario = await Usuario.create({
      nombre,
      correo,
      password,
      roles: rolesAsignados.map((rol) => rol._id),
      mfaObligatorio: mfaObligatorio === true,
      usuarioCreacion: await nombreDelUsuario(req)
    });

    const rolesNuevos = rolesAsignados.map((rol) => rol.nombreRol);
    await registrarEvento(req, 'ROL_ASIGNADO_USUARIO', {
      detalles: {
        usuario: { id: String(usuario._id), correo: usuario.correo },
        rolesAnteriores: [],
        rolesNuevos
      }
    });

    await usuario.populate('roles', '_id nombreRol');
    res.status(201).json(usuario);
  } catch (error) {
    if (respuestaErrorUsuario(error, res)) return;
    console.error('[Usuarios] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/** PUT /api/usuarios/:id */
export const actualizarUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (respondioIdInvalido(id, res, 'del usuario')) return;

    const usuario = await Usuario.findOne({ _id: id, activo: true });
    if (!usuario) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    const { nombre, correo, password, roles, mfaObligatorio } = req.body ?? {};
    if (password !== undefined && respondioPasswordInvalida(password, res)) return;

    // Evita la autoescalada y la perdida accidental de la propia administracion.
    if (roles !== undefined && esSuPropiaCuenta(req, String(id))) {
      res.status(409).json({ mensaje: 'No puede modificar sus propios roles.' });
      return;
    }

    const rolesAnteriores = roles === undefined ? [] : await nombresDeRoles(usuario.roles);
    const rolesNuevosDocumentos = roles === undefined ? undefined : await validarRolesActivos(roles);

    if (correo !== undefined) {
      const correoNormalizado = String(correo).toLowerCase().trim();
      const otro = await Usuario.findOne({ correo: correoNormalizado, _id: { $ne: usuario._id } });
      if (otro) {
        res.status(409).json({ mensaje: MENSAJE_DUPLICADO });
        return;
      }
      usuario.correo = correoNormalizado;
    }

    if (nombre !== undefined) usuario.nombre = nombre;
    if (rolesNuevosDocumentos) usuario.roles = rolesNuevosDocumentos.map((rol) => rol._id);
    if (mfaObligatorio !== undefined) usuario.mfaObligatorio = mfaObligatorio === true;
    if (password !== undefined) usuario.password = password;

    usuario.usuarioActualizacion = await nombreDelUsuario(req);
    await usuario.save();

    if (rolesNuevosDocumentos) {
      await registrarEvento(req, 'ROL_ASIGNADO_USUARIO', {
        detalles: {
          usuario: { id: String(usuario._id), correo: usuario.correo },
          rolesAnteriores,
          rolesNuevos: rolesNuevosDocumentos.map((rol) => rol.nombreRol)
        }
      });
    }

    await usuario.populate('roles', '_id nombreRol');
    res.status(200).json(usuario);
  } catch (error) {
    if (respuestaErrorUsuario(error, res)) return;
    console.error('[Usuarios] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/** DELETE /api/usuarios/:id: baja logica. */
export const inactivarUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (respondioIdInvalido(id, res, 'del usuario')) return;
    if (esSuPropiaCuenta(req, String(id))) {
      res.status(409).json({ mensaje: 'No puede darse de baja a sí mismo. Pídale la baja a otro administrador.' });
      return;
    }

    const usuario = await Usuario.findOne({ _id: id, activo: true });
    if (!usuario) {
      res.status(404).json({ mensaje: 'El usuario indicado no existe o ya está inactivo' });
      return;
    }

    usuario.activo = false;
    usuario.usuarioActualizacion = await nombreDelUsuario(req);
    await usuario.save();
    await usuario.populate('roles', '_id nombreRol');
    res.status(200).json({ mensaje: 'Usuario inactivado', usuario });
  } catch (error) {
    console.error('[Usuarios] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/** POST /api/usuarios/:id/mfa/reiniciar */
export const reiniciarMfaDeUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (respondioIdInvalido(id, res, 'del usuario')) return;

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
    await usuario.populate('roles', '_id nombreRol');

    res.status(200).json({
      mensaje: teniaMfaActivado
        ? 'Verificación en dos pasos reiniciada. El usuario deberá configurarla de nuevo.'
        : 'El usuario no tenía la verificación en dos pasos activada; quedó limpia igual.',
      usuario,
      mfaObligatorio: usuario.mfaObligatorio
    });
  } catch (error) {
    console.error('[Usuarios] Error al reiniciar el MFA:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
