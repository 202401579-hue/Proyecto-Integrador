import { Router } from 'express';
import { obtenerCola, reevaluar } from '../controllers/colaController';
import { verificarToken } from '../middlewares/verificarToken';
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// Administrador, Coordinador y Operador: los tres ven el patio de
// maniobras hoy (ver GatewaysTablero.tsx). En el Sprint 7 esto pasa a
// checkPermission('cola') en lugar de una lista fija de roles.
router.get('/', checkPermission('cola'), obtenerCola);
router.post('/reevaluar', checkPermission('cola'), reevaluar);

export default router;
