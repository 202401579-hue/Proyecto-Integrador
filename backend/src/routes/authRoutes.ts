import { Router, Request, Response } from 'express';
import { login } from '../controllers/authController';
import { verificarLoginConMfa } from '../controllers/mfaController';
import { verificarToken } from '../middlewares/verificarToken';
import { verifyTempToken } from '../middlewares/verifyTempToken';
import { checkPermission } from '../middlewares/checkPermission';
import { PERMISOS_VALIDOS } from '../models/Role';

const router = Router();

// POST /api/auth/login  (el prefijo /api/auth se monta en server.ts)
router.post('/login', login);

// POST /api/auth/mfa/verify-login
//
// Segundo paso del login. Vive aca y no en mfaRoutes porque es parte del
// inicio de sesion, no de la configuracion del factor: es el endpoint que
// termina de abrir la sesion y entrega el token definitivo. La ruta es la
// que fija el enunciado.
router.post('/mfa/verify-login', verifyTempToken, verificarLoginConMfa);

// ---------------------------------------------------------------------------
// Rutas de demostracion del RBAC.
// El Sprint 0 no pide rutas protegidas, pero sin ellas los middlewares
// nunca se ejecutarian. Sirven para probarlos en Postman y para mostrar
// el flujo completo en la defensa.
// ---------------------------------------------------------------------------

// Requiere token válido y al menos un permiso vigente en la base.
router.get('/perfil', verificarToken, checkPermission(...PERMISOS_VALIDOS), (req: Request, res: Response) => {
  res.json({ usuario: req.usuario });
});

// Ruta demostrativa: requiere el permiso de administracion de usuarios.
router.get(
  '/solo-admin',
  verificarToken,
  checkPermission('usuarios'),
  (_req: Request, res: Response) => {
    res.json({ mensaje: 'Ruta visible con el permiso usuarios' });
  }
);

export default router;
