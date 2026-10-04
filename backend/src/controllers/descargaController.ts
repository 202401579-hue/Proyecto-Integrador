import { Request, Response } from 'express';
import Descarga from '../models/Descarga';
import Gateway from '../models/Gateway';
import Pedido, { EstadoPedido } from '../models/Pedido';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { respondioIdInvalido } from '../services/respuestasError';

const MENSAJE_PEDIDO_NO_ENCONTRADO = 'El pedido indicado no existe o está inactivo';
const MENSAJE_GATEWAY_NO_ENCONTRADO = 'El gateway indicado no existe o está inactivo';
const MENSAJE_DESCARGA_NO_ENCONTRADA = 'La descarga ya fue finalizada o no existe';

/**
 * Estados de pedido sobre los que se puede iniciar una descarga: el camion
 * ya llego (ANTICIPADO, A TIEMPO o TARDÍO). Un PROGRAMADO no llego todavia,
 * y un AUSENTE, CANCELADO, EN COLA, DESCARGANDO o FINALIZADO ya estan en
 * otro punto del ciclo.
 */
const ESTADOS_PEDIDO_DESCARGABLE: EstadoPedido[] = ['ANTICIPADO', 'A TIEMPO', 'TARDÍO'];

/** Nombre y ruta del populate que llevan iniciar, finalizar y las activas. */
const POPULATE_PEDIDO = { path: 'pedidoId', populate: { path: 'proveedorId' } } as const;

/**
 * POST /api/descargas/iniciar
 *
 * Recibe { pedidoId, gatewayId }. Ocupa el gateway y pasa el pedido a
 * DESCARGANDO con actualizaciones condicionales (findOneAndUpdate) en vez
 * de una transaccion: el MongoDB local instalado no soporta transacciones
 * entre varios documentos (eso requiere un replica set). El orden es
 * seguro porque cada paso solo avanza si el anterior se confirmo, y si un
 * paso falla se revierte el que ya se habia hecho antes de responder.
 *
 * Orden: validar ids -> pedido y gateway existen y activos -> pedido
 * llegado -> tipo de carga compatible (RN-07/RN-08) -> ocupar gateway ->
 * pasar pedido a DESCARGANDO -> crear la descarga.
 */
export const iniciarDescarga = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pedidoId, gatewayId } = req.body ?? {};

    if (respondioIdInvalido(pedidoId, res, 'del pedido')) {
      return;
    }

    if (respondioIdInvalido(gatewayId, res, 'del gateway')) {
      return;
    }

    const [pedido, gateway] = await Promise.all([
      Pedido.findOne({ _id: pedidoId, activo: true }),
      Gateway.findOne({ _id: gatewayId, activo: true })
    ]);

    if (!pedido) {
      res.status(404).json({ mensaje: MENSAJE_PEDIDO_NO_ENCONTRADO });
      return;
    }

    if (!gateway) {
      res.status(404).json({ mensaje: MENSAJE_GATEWAY_NO_ENCONTRADO });
      return;
    }

    // El pedido tiene que haber llegado. Se valida aca, en el backend, no
    // solo filtrando en la pantalla: es lo que impide descargar un pedido
    // que no llego, o descargar el mismo pedido en dos bahias a la vez.
    if (!ESTADOS_PEDIDO_DESCARGABLE.includes(pedido.estado)) {
      res.status(400).json({
        mensaje: `No se puede iniciar una descarga: el pedido está en estado ${pedido.estado}`
      });
      return;
    }

    // RN-07 / RN-08: el tipo de producto tiene que coincidir con el tipo de
    // carga de la bahia.
    if (pedido.tipoProducto !== gateway.tipoCargaPermitida) {
      res.status(400).json({
        mensaje: `El gateway ${gateway.numeroGateway} solo admite carga "${gateway.tipoCargaPermitida}"`
      });
      return;
    }

    // Ocupar el gateway con una sola actualizacion condicional: si otra
    // peticion lo ocupo primero, o ya no esta LIBRE, devuelve null. Asi dos
    // coordinadores que aprietan a la vez nunca ocupan la misma bahia.
    const gatewayOcupado = await Gateway.findOneAndUpdate(
      { _id: gateway._id, activo: true, estado: 'LIBRE' },
      { estado: 'OCUPADO' }
    );

    if (!gatewayOcupado) {
      res.status(400).json({
        mensaje: 'El gateway no está disponible: ya fue ocupado o no está LIBRE'
      });
      return;
    }

    // Pasar el pedido a DESCARGANDO, condicionado a que siga en uno de los
    // tres estados descargables.
    const pedidoDescargando = await Pedido.findOneAndUpdate(
      { _id: pedido._id, activo: true, estado: { $in: ESTADOS_PEDIDO_DESCARGABLE } },
      { estado: 'DESCARGANDO' }
    );

    if (!pedidoDescargando) {
      // El gateway ya se habia ocupado: se revierte, nadie quedo usandolo.
      await Gateway.findByIdAndUpdate(gateway._id, { estado: 'LIBRE' });
      res.status(400).json({
        mensaje: 'El pedido ya no está disponible para iniciar una descarga'
      });
      return;
    }

    try {
      const descarga = await Descarga.create({
        gatewayId: gateway._id,
        pedidoId: pedido._id,
        operadorId: req.usuario?.id,
        fechaHoraInicio: new Date(),
        usuarioCreacion: await nombreDelUsuario(req)
      });

      const descargaPoblada = await Descarga.findById(descarga._id)
        .populate('gatewayId')
        .populate(POPULATE_PEDIDO);

      res.status(201).json({ mensaje: 'Descarga iniciada', descarga: descargaPoblada });
    } catch (errorAlCrear) {
      // La descarga no se pudo crear: se revierten el pedido y el gateway a
      // como estaban antes de esta peticion.
      await Gateway.findByIdAndUpdate(gateway._id, { estado: 'LIBRE' });
      await Pedido.findByIdAndUpdate(pedido._id, { estado: pedido.estado });
      throw errorAlCrear;
    }
  } catch (error) {
    console.error('[Descargas] Error al iniciar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/descargas/finalizar
 *
 * Acepta el id de la descarga como descargasId (asi lo escribe el
 * enunciado) o como descargaId. La hora de fin y la duracion las calcula
 * el servidor, nunca el cliente. El cierre va condicionado a
 * fechaHoraFin: null: si la descarga ya se habia cerrado (dos clics, o dos
 * personas finalizando a la vez), la segunda peticion encuentra null y
 * responde 400 en lugar de recalcular la duracion.
 */
export const finalizarDescarga = async (req: Request, res: Response): Promise<void> => {
  try {
    const { descargasId, descargaId } = req.body ?? {};
    const id = descargasId ?? descargaId;

    if (respondioIdInvalido(id, res, 'de la descarga')) {
      return;
    }

    const descargaEnCurso = await Descarga.findOne({ _id: id, activo: true });

    if (!descargaEnCurso) {
      res.status(400).json({ mensaje: MENSAJE_DESCARGA_NO_ENCONTRADA });
      return;
    }

    const fechaHoraFin = new Date();
    const duracionMinutos = Math.round(
      (fechaHoraFin.getTime() - descargaEnCurso.fechaHoraInicio.getTime()) / 60000
    );

    const descargaCerrada = await Descarga.findOneAndUpdate(
      { _id: id, fechaHoraFin: null },
      {
        fechaHoraFin,
        duracionMinutos,
        usuarioActualizacion: await nombreDelUsuario(req)
      },
      { new: true }
    )
      .populate('gatewayId')
      .populate(POPULATE_PEDIDO);

    if (!descargaCerrada) {
      res.status(400).json({ mensaje: MENSAJE_DESCARGA_NO_ENCONTRADA });
      return;
    }

    // RN-11: el pedido queda FINALIZADO y la bahia vuelve a estar LIBRE.
    await Promise.all([
      Pedido.findByIdAndUpdate(descargaEnCurso.pedidoId, { estado: 'FINALIZADO' }),
      Gateway.findByIdAndUpdate(descargaEnCurso.gatewayId, { estado: 'LIBRE' })
    ]);

    res.status(200).json({ mensaje: 'Descarga finalizada', descarga: descargaCerrada });
  } catch (error) {
    console.error('[Descargas] Error al finalizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/descargas/activas
 *
 * Devuelve las descargas en curso (fechaHoraFin: null), con el gateway y
 * el pedido poblados -- el pedido con su proveedor adentro -- para que el
 * tablero sepa, en cada gateway OCUPADO, que pedido y que proveedor estan
 * descargando ahi.
 */
export const listarDescargasActivas = async (_req: Request, res: Response): Promise<void> => {
  try {
    const descargas = await Descarga.find({ activo: true, fechaHoraFin: null })
      .populate('gatewayId')
      .populate(POPULATE_PEDIDO);

    res.status(200).json(descargas);
  } catch (error) {
    console.error('[Descargas] Error al listar las activas:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
