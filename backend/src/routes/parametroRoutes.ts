import { Router } from 'express';
import {
  actualizarParametro,
  crearParametro,
  inactivarParametro,
  listarParametros
} from '../controllers/parametroController';
import { verificarToken } from '../middlewares/verificarToken';
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// Regla explicita del Sprint 7: parametros es permiso roles incluso en GET.
// Por ello Coordinador pierde esta lectura; no se le concede roles solo para
// conservarla, porque seria un privilegio administrativo innecesario.
router.get('/', checkPermission('roles'), listarParametros);

router.post('/', checkPermission('roles'), crearParametro);

router.put('/:id', checkPermission('roles'), actualizarParametro);

// DELETE es borrado logico: pasa activo a false, no borra el documento.
router.delete('/:id', checkPermission('roles'), inactivarParametro);

export default router;
