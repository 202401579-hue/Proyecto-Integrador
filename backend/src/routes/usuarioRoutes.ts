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
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// Todo el módulo de usuarios pide ACCESS válido (401) y permiso usuarios
// vigente en MongoDB (403).
router.use(verificarToken, checkPermission('usuarios'));

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
