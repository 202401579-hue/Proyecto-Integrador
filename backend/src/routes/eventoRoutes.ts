import { Router } from 'express';
import { listarEventos } from '../controllers/eventoController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Toda la bitacora exige sesion: no hay eventos publicos.
router.use(verificarToken);

/**
 * GET /api/eventos
 *
 * La bitacora es de supervision, asi que la leen el Administrador y el
 * Coordinador. El Operador queda afuera a proposito: su trabajo es
 * registrar arribos y descargas, no revisar quien hizo que.
 */
router.get('/', autorizarRoles('Administrador', 'Coordinador'), listarEventos);

/**
 * No hay POST, PUT, PATCH ni DELETE, y no es que falten por hacer: los
 * eventos son de solo insercion (RN-14) y los escribe el backend cuando
 * una operacion real termina bien (ver services/eventos.ts). El modelo
 * ademas bloquea cualquier modificacion, asi que no alcanzaria con
 * agregar una ruta: la escritura fallaria igual.
 */

export default router;
