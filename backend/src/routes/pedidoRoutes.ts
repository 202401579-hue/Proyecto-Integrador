import { Router } from 'express';
import { crearPedido, listarPedidos } from '../controllers/pedidoController';
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

export default router;
