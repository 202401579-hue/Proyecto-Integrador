import { Router } from 'express';
import { controlarAusencias, registrarLlegada } from '../controllers/llegadaController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// POST /api/llegadas  (el prefijo /api/llegadas se monta en server.ts)
//
// El arribo lo registra quien esta en el anden recibiendo el camion, que es
// el Operador. El Coordinador tambien puede, porque es el dueno de la agenda
// y necesita poder corregir la operacion del dia.
router.post('/', autorizarRoles('Operador', 'Coordinador'), registrarLlegada);

// POST /api/llegadas/control-ausencias
//
// No registra un arribo: cierra los pedidos que nunca llegaron. Es una tarea
// de supervision, asi que queda para el Coordinador y el Administrador.
router.post(
  '/control-ausencias',
  autorizarRoles('Coordinador', 'Administrador'),
  controlarAusencias
);

export default router;
