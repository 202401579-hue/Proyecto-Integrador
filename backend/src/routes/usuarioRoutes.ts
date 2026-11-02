import { Router } from 'express';
import {
  actualizarUsuario,
  crearUsuario,
  inactivarUsuario,
  listarUsuarios,
  obtenerUsuario,
  reiniciarMfaDeUsuario
} from '../controllers/usuarioController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Todo el modulo de usuarios es del rol Administrador: pide token de
// acceso valido (401) y ese rol (403). Un Coordinador o un Operador no
// alcanzan ninguna de estas rutas.
router.use(verificarToken, autorizarRoles('Administrador'));

// GET /api/usuarios  (el prefijo /api/usuarios se monta en server.ts)
router.get('/', listarUsuarios);

// GET /api/usuarios/:id
router.get('/:id', obtenerUsuario);

// POST /api/usuarios
router.post('/', crearUsuario);

// PUT /api/usuarios/:id
router.put('/:id', actualizarUsuario);

// DELETE /api/usuarios/:id  (borrado logico: pasa activo a false)
router.delete('/:id', inactivarUsuario);

// POST /api/usuarios/:id/mfa/reiniciar
//
// Para quien perdio el telefono y para poder repetir la demostracion.
router.post('/:id/mfa/reiniciar', reiniciarMfaDeUsuario);

export default router;
