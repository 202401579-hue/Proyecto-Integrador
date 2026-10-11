import { Router } from 'express';
import { obtenerKpis } from '../controllers/kpiController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Igual que la bitácora de eventos: es información de supervisión, así que
// la ven el Administrador y el Coordinador. El Operador recibe 403.
router.use(verificarToken, autorizarRoles('Administrador', 'Coordinador'));

/**
 * GET /api/kpis
 *
 * Query opcional ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD. Ver kpiController.ts
 * para el valor por defecto y las validaciones.
 */
router.get('/', obtenerKpis);

export default router;
