import { Router } from 'express';
import {
  finalizarDescarga,
  iniciarDescarga,
  listarDescargasActivas
} from '../controllers/descargaController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// POST /api/descargas/iniciar  (el prefijo /api/descargas se monta en server.ts)
//
// Inicia la descarga desde el tablero: la aprieta el Coordinador, y
// tambien el Operador porque es quien esta fisicamente en el anden.
router.post('/iniciar', autorizarRoles('Coordinador', 'Operador'), iniciarDescarga);

// POST /api/descargas/finalizar
router.post('/finalizar', autorizarRoles('Coordinador', 'Operador'), finalizarDescarga);

// GET /api/descargas/activas
//
// Para el tablero de gateways: Administrador y Coordinador la necesitan
// para saber que bahia esta ocupada por cual pedido.
router.get('/activas', autorizarRoles('Administrador', 'Coordinador'), listarDescargasActivas);

export default router;
