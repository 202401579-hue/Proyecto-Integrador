import { Request, Response } from 'express';
import Descarga from '../models/Descarga';
import Gateway from '../models/Gateway';
import Pedido from '../models/Pedido';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { respondioIdInvalido } from '../services/respuestasError';
import { registrarEvento } from '../services/eventos';
import {
  POPULATE_PEDIDO,
  iniciarDescargaDePedido,
  promoverPrimeroDeLaCola
} from '../services/descargas';

const MENSAJE_DESCARGA_NO_ENCONTRADA = 'La descarga ya fue finalizada o no existe';

/**
 * POST /api/descargas/iniciar
 *
 * Recibe { pedidoId, gatewayId }. Las reglas y el orden de las escrituras
 * estan en services/descargas.ts, porque las comparte con la promocion
 * automatica de la cola. Aca solo se validan los ids que vienen del cliente
 * y se traduce el resultado a una respuesta HTTP.
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

    const resultado = await iniciarDescargaDePedido(req, pedidoId, gatewayId);

    if (resultado.tipo === 'rechazado') {
      res.status(resultado.estado).json({ mensaje: resultado.mensaje });
      return;
    }

    res.status(201).json({ mensaje: 'Descarga iniciada', descarga: resultado.descarga });
  } catch (error) {
    console.error('[Descargas] Error al iniciar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/descargas/finalizar
 *
 * Acepta el id de la descarga como descargasId (asi lo escribe el enunciado)
 * o como descargaId. La hora de fin y la duracion las calcula el servidor,
 * nunca el cliente.
 *
 * RN-11 exige que el gateway no se libere sin haber registrado antes la hora
 * de fin y pasado el pedido a FINALIZADO. Como el MongoDB local no soporta
 * transacciones entre documentos, la regla se cumple con el ORDEN de las
 * escrituras y con reversion explicita:
 *
 *   1. cerrar la descarga   (condicionado a fechaHoraFin: null)
 *   2. pedido a FINALIZADO  (condicionado a estado: DESCARGANDO)
 *   3. gateway a LIBRE      (condicionado a estado: OCUPADO)
 *
 * Si falla el 2, se revierte el 1. Si falla el 3, se revierten el 2 y el 1.
 * El gateway es el ultimo justamente porque es el recurso que, si queda libre
 * de mas, el sistema le ofrece a otro camion: liberarlo antes de confirmar lo
 * demas es el unico error de esta secuencia que manda un camion a una bahia
 * ocupada.
 *
 * Despues de liberarlo se intenta promover al primero de la cola compatible.
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

    // --- Paso 1: cerrar la descarga ---
    //
    // Condicionado a fechaHoraFin: null. Si ya se habia cerrado (dos clics, o
    // dos personas finalizando a la vez), la segunda peticion encuentra null
    // y responde 400 en lugar de recalcular la duracion.
    const descargaCerrada = await Descarga.findOneAndUpdate(
      { _id: id, fechaHoraFin: null },
      {
        fechaHoraFin,
        duracionMinutos,
        usuarioActualizacion: await nombreDelUsuario(req)
      },
      { new: true }
    );

    if (!descargaCerrada) {
      res.status(400).json({ mensaje: MENSAJE_DESCARGA_NO_ENCONTRADA });
      return;
    }

    /** Deja la descarga como estaba antes del paso 1. */
    const reabrirDescarga = async (): Promise<void> => {
      await Descarga.findByIdAndUpdate(descargaEnCurso._id, {
        fechaHoraFin: null,
        duracionMinutos: null
      });
    };

    // --- Paso 2: el pedido pasa a FINALIZADO ---
    const pedidoFinalizado = await Pedido.findOneAndUpdate(
      { _id: descargaEnCurso.pedidoId, activo: true, estado: 'DESCARGANDO' },
      { estado: 'FINALIZADO' },
      { new: true }
    );

    if (!pedidoFinalizado) {
      await reabrirDescarga();
      console.error(
        '[Descargas] No se pudo pasar el pedido a FINALIZADO: su estado cambió durante la operación.',
        { descargaId: String(descargaEnCurso._id), pedidoId: String(descargaEnCurso.pedidoId) }
      );
      res.status(409).json({
        mensaje:
          'No se pudo finalizar: el estado del pedido cambió durante la operación. No se cerró la descarga ni se liberó el gateway.'
      });
      return;
    }

    // --- Paso 3: recien ahora se libera el gateway ---
    const gatewayLiberado = await Gateway.findOneAndUpdate(
      { _id: descargaEnCurso.gatewayId, estado: 'OCUPADO' },
      { estado: 'LIBRE' },
      { new: true }
    );

    if (!gatewayLiberado) {
      // Se deshacen los dos pasos anteriores, en orden inverso. Queda todo
      // como antes de la peticion: la descarga abierta y el pedido
      // DESCARGANDO, que es la situacion real si el gateway no se pudo liberar.
      await Pedido.findByIdAndUpdate(descargaEnCurso.pedidoId, { estado: 'DESCARGANDO' });
      await reabrirDescarga();
      console.error(
        '[Descargas] No se pudo liberar el gateway: su estado ya no era OCUPADO. Se revirtieron el pedido y la descarga.',
        { descargaId: String(descargaEnCurso._id), gatewayId: String(descargaEnCurso.gatewayId) }
      );
      res.status(409).json({
        mensaje:
          'No se pudo liberar el gateway: su estado cambió durante la operación. La descarga sigue abierta.'
      });
      return;
    }

    await registrarEvento(req, 'DESCARGA_FINALIZADA', {
      pedidoId: descargaEnCurso.pedidoId,
      detalles: {
        numeroGateway: gatewayLiberado.numeroGateway,
        numeroPedido: pedidoFinalizado.numeroPedido,
        duracionMinutos,
        descargaId: String(descargaEnCurso._id)
      }
    });

    await descargaCerrada.populate('gatewayId');
    await descargaCerrada.populate(POPULATE_PEDIDO);

    // --- Promocion de la cola ---
    //
    // Va despues de responder al negocio lo importante: la finalizacion ya
    // esta hecha y confirmada. Si la promocion falla, no se deshace nada; el
    // gateway queda LIBRE y el proximo intento (manual o la siguiente
    // finalizacion) lo vuelve a ofrecer.
    let promocion = null;

    try {
      const promovida = await promoverPrimeroDeLaCola(req, gatewayLiberado);

      if (promovida?.tipo === 'iniciada') {
        promocion = {
          pedido: promovida.pedido,
          gateway: promovida.gateway,
          descarga: promovida.descarga
        };
      } else if (promovida?.tipo === 'rechazado') {
        // No es un error del cliente: la cola tenia un candidato y algo
        // cambio entre la busqueda y el inicio. Se deja en el log y el
        // gateway queda libre.
        console.error('[Descargas] No se pudo promover al siguiente de la cola:', promovida.mensaje);
      }
    } catch (error) {
      console.error(
        '[Descargas] Falló la promoción de la cola. La finalización sí quedó hecha.',
        error
      );
    }

    res.status(200).json({
      mensaje: 'Descarga finalizada',
      descarga: descargaCerrada,
      // null cuando no habia nadie esperando una bahia de ese tipo de carga.
      promocion
    });
  } catch (error) {
    console.error('[Descargas] Error al finalizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/descargas/activas
 *
 * Devuelve las descargas en curso (fechaHoraFin: null), con el gateway y el
 * pedido poblados -- el pedido con su proveedor adentro -- para que el
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
