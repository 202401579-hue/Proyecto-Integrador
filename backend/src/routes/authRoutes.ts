import { Router, Request, Response } from 'express';
import { login } from '../controllers/authController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// POST /api/auth/login  (el prefijo /api/auth se monta en server.ts)
router.post('/login', login);

// ---------------------------------------------------------------------------
// Rutas de demostracion del RBAC.
// El Sprint 0 no pide rutas protegidas, pero sin ellas los middlewares
// nunca se ejecutarian. Sirven para probarlos en Postman y para mostrar
// el flujo completo en la defensa.
// ---------------------------------------------------------------------------

// Requiere token valido, sin importar el rol.
router.get('/perfil', verificarToken, (req: Request, res: Response) => {
  res.json({ usuario: req.usuario });
});

// Requiere token valido Y rol Administrador. Los otros roles reciben 403.
router.get(
  '/solo-admin',
  verificarToken,
  autorizarRoles('Administrador'),
  (_req: Request, res: Response) => {
    res.json({ mensaje: 'Ruta visible solo para el rol Administrador' });
  }
);

export default router;
