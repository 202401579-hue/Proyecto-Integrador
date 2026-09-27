import { Router } from 'express';
import {
  actualizarPedido,
  cancelarPedido,
  crearPedido,
  inactivarPedido,
  listarPedidos,
  reprogramarPedido
} from '../controllers/pedidoController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// La programacion de pedidos es del rol Coordinador: todas las rutas
// piden token valido (401) y ese rol (403).
router.use(verificarToken, autorizarRoles('Coordinador'));

// POST /api/pedidos  (el prefijo /api/pedidos se monta en server.ts)
router.post('/', crearPedido);

// GET /api/pedidos
router.get('/', listarPedidos);

// PUT /api/pedidos/:id  (datos administrativos, no la ventana horaria)
router.put('/:id', actualizarPedido);

// PUT /api/pedidos/:id/reprogramar  (mueve la ventana y revalida la agenda)
router.put('/:id/reprogramar', reprogramarPedido);

// PUT /api/pedidos/:id/cancelar  (estado CANCELADO y activo en false)
router.put('/:id/cancelar', cancelarPedido);

// DELETE /api/pedidos/:id  (borrado logico: pasa activo a false)
router.delete('/:id', inactivarPedido);

export default router;
