import { Router } from 'express';
import { activarMfa, configurarMfa } from '../controllers/mfaController';
import { verifyTempToken } from '../middlewares/verifyTempToken';

const router = Router();

/**
 * Rutas de configuracion del segundo factor.
 *
 * Van detras de verifyTempToken y NO de verificarToken: a este modulo se
 * entra con el token temporal del login, porque quien tiene que configurar
 * el MFA es justamente quien todavia no puede obtener un token de acceso.
 *
 * No hay ninguna comprobacion de rol: configurar el propio segundo factor
 * es algo que hacen los tres roles por igual, cada uno sobre su cuenta. De
 * que cuenta se trata lo dice el token, no el cliente, asi que no hay forma
 * de configurarle el MFA a otra persona.
 */
router.use(verifyTempToken);

// POST /api/mfa/setup   (el prefijo /api/mfa se monta en server.ts)
router.post('/setup', configurarMfa);

// POST /api/mfa/enable
router.post('/enable', activarMfa);

export default router;
