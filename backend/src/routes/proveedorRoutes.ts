import { Router } from 'express';
import { crearProveedor, listarProveedores } from '../controllers/proveedorController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// El modulo de proveedores es del rol Coordinador: todas las rutas
// piden token valido (401) y ese rol (403).
router.use(verificarToken, autorizarRoles('Coordinador'));

// POST /api/proveedores  (el prefijo /api/proveedores se monta en server.ts)
router.post('/', crearProveedor);

// GET /api/proveedores
router.get('/', listarProveedores);

export default router;
