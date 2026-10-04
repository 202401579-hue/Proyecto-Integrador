import { Router } from 'express';
import {
  actualizarGateway,
  crearGateway,
  inactivarGateway,
  listarGateways,
  obtenerGateway
} from '../controllers/gatewayController';
import { verificarToken } from '../middlewares/verificarToken';
import { autorizarRoles } from '../middlewares/autorizarRoles';

const router = Router();

// Todas las rutas piden token valido (401).
router.use(verificarToken);

// Las bahias son infraestructura del deposito: habilitarlas, cambiarles el
// tipo de carga o darlas de baja es del Administrador. El Coordinador las
// lee porque necesita saber que bahias hay y cuales estan disponibles para
// asignar una descarga.
router.get('/', autorizarRoles('Administrador', 'Coordinador'), listarGateways);

router.get('/:id', autorizarRoles('Administrador', 'Coordinador'), obtenerGateway);

router.post('/', autorizarRoles('Administrador'), crearGateway);

router.put('/:id', autorizarRoles('Administrador'), actualizarGateway);

// DELETE es borrado logico: pasa activo a false, no borra el documento.
router.delete('/:id', autorizarRoles('Administrador'), inactivarGateway);

export default router;
