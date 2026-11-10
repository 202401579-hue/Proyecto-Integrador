import { Router } from 'express';
import {
  actualizarProveedor,
  crearProveedor,
  inactivarProveedor,
  listarProveedores
} from '../controllers/proveedorController';
import { verificarToken } from '../middlewares/verificarToken';
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// El módulo requiere token válido (401) y permiso proveedores (403).
router.use(verificarToken, checkPermission('proveedores'));

// POST /api/proveedores  (el prefijo /api/proveedores se monta en server.ts)
router.post('/', crearProveedor);

// GET /api/proveedores
router.get('/', listarProveedores);

// PUT /api/proveedores/:id
router.put('/:id', actualizarProveedor);

// DELETE /api/proveedores/:id  (borrado logico: pasa activo a false)
router.delete('/:id', inactivarProveedor);

export default router;
