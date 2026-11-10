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
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// Todas las rutas requieren token válido (401) y permiso pedidos (403).
router.use(verificarToken, checkPermission('pedidos'));

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
