import { Router } from 'express';
import {
  actualizarGateway,
  crearGateway,
  inactivarGateway,
  listarGateways,
  obtenerGateway
} from '../controllers/gatewayController';
import { verificarToken } from '../middlewares/verificarToken';
import { checkPermission } from '../middlewares/checkPermission';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// Las bahias son infraestructura del deposito: habilitarlas, cambiarles el
// tipo de carga o darlas de baja es del Administrador. El Coordinador las
// lee porque necesita saber que bahias hay y cuales estan disponibles para
// asignar una descarga.
router.get('/', checkPermission('gateways'), listarGateways);

router.get('/:id', checkPermission('gateways'), obtenerGateway);

router.post('/', checkPermission('gateways'), crearGateway);

router.put('/:id', checkPermission('gateways'), actualizarGateway);

// DELETE es borrado logico: pasa activo a false, no borra el documento.
router.delete('/:id', checkPermission('gateways'), inactivarGateway);

export default router;
