import { Router } from 'express';
import {
  actualizarParametro,
  crearParametro,
  inactivarParametro,
  listarParametros
} from '../controllers/parametroController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// Los parametros cambian como se comporta el sistema entero: un margen de
// tolerancia mal puesto reclasifica todas las llegadas. Por eso escribir es
// del Administrador, y el Coordinador solo puede leerlos, porque su modulo
// necesita mostrar con que horario y tolerancias se esta trabajando.
router.get('/', autorizarRoles('Administrador', 'Coordinador'), listarParametros);

router.post('/', autorizarRoles('Administrador'), crearParametro);

router.put('/:id', autorizarRoles('Administrador'), actualizarParametro);

// DELETE es borrado logico: pasa activo a false, no borra el documento.
router.delete('/:id', autorizarRoles('Administrador'), inactivarParametro);

export default router;
