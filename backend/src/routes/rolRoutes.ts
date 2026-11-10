import { Router } from 'express';
import { actualizarRol, crearRol, inactivarRol, listarRoles } from '../controllers/rolController';
import { checkPermission } from '../middlewares/checkPermission';
import { verificarToken } from '../middlewares/verificarToken';

const router = Router();

router.use(verificarToken);

// Consultar los roles sirve tanto para administrar roles como para el alta de
// usuarios, por eso admite cualquiera de los dos permisos.
router.get('/', checkPermission('roles', 'usuarios'), listarRoles);
router.post('/', checkPermission('roles'), crearRol);
router.put('/:id', checkPermission('roles'), actualizarRol);
router.delete('/:id', checkPermission('roles'), inactivarRol);

export default router;
