import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Pedido from '../models/Pedido';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { obtenerConfiguracionOperativa } from '../services/configuracionOperativa';
import { clasificarLlegada, limiteDeAusencia, minutosDeDiferencia } from '../services/puntualidad';
import { marcarPedidosAusentes } from '../services/controlAusencias';

/**
 * POST /api/llegadas
 *
 * Registra el arribo de un pedido (HU-02, control de arribos).
 *
 * Recibe la identificacion del pedido: { pedidoId } o { numeroPedido }. Se
 * aceptan las dos formas porque en el anden se trabaja con el numero de la
 * orden de compra, que es lo que viene escrito en el remito, mientras que el
 * frontend ya tiene el _id del pedido que esta mostrando.
 *
 * La hora de llegada NO se lee del body: la pone el servidor. Si la mandara
 * el cliente, cualquiera podria "llegar a tiempo" escribiendo otra hora.
 *
 * Con esa hora y los margenes de la coleccion parametros se clasifica la
 * puntualidad (ANTICIPADO, A TIEMPO, TARDÍO o AUSENTE) y se guarda el
 * resultado en el pedido junto con fechaHoraLlegadaReal.
 */
export const registrarLlegada = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pedidoId, numeroPedido } = req.body ?? {};

    const tienePedidoId = typeof pedidoId === 'string' && pedidoId.trim() !== '';
    const tieneNumero = typeof numeroPedido === 'string' && numeroPedido.trim() !== '';

    if (!tienePedidoId && !tieneNumero) {
      res.status(400).json({
        mensaje: 'Se requiere pedidoId o numeroPedido para registrar la llegada'
      });
      return;
    }

    if (tienePedidoId && !mongoose.isValidObjectId(pedidoId)) {
      res.status(400).json({ mensaje: 'El identificador del pedido no es válido' });
      return;
    }

    // Solo pedidos activos: uno dado de baja o cancelado ya no espera camion.
    const filtro = tienePedidoId
      ? { _id: pedidoId, activo: true }
      : { numeroPedido: numeroPedido.trim(), activo: true };

    const pedido = await Pedido.findOne(filtro);

    if (!pedido) {
      res.status(404).json({ mensaje: 'El pedido indicado no existe, está cancelado o inactivo' });
      return;
    }

    // La llegada se registra una sola vez. Permitir la segunda sobrescribiria
    // la hora real del arribo, que es justamente el dato que se audita.
    if (pedido.fechaHoraLlegadaReal) {
      res.status(409).json({
        mensaje: 'El pedido ya registró su llegada',
        fechaHoraLlegadaReal: pedido.fechaHoraLlegadaReal,
        estado: pedido.estado
      });
      return;
    }

    const { tolerancias } = await obtenerConfiguracionOperativa();

    // Hora del servidor, igual que el resto de las fechas del sistema.
    const llegada = new Date();
    const estado = clasificarLlegada(llegada, pedido.inicioVentana, tolerancias);

    pedido.fechaHoraLlegadaReal = llegada;
    pedido.estado = estado;
    pedido.usuarioActualizacion = await nombreDelUsuario(req);

    await pedido.save();
    await pedido.populate('proveedorId');

    res.status(200).json({
      mensaje: `Llegada registrada: ${estado}`,
      clasificacion: {
        estado,
        // Negativo si llego antes de la hora, positivo si llego despues.
        // Se devuelve para que el frontend pueda explicar el estado sin
        // tener que recalcular nada ni conocer los margenes.
        minutosDeDiferencia: minutosDeDiferencia(llegada, pedido.inicioVentana),
        inicioVentana: pedido.inicioVentana,
        limiteDeAusencia: limiteDeAusencia(pedido.inicioVentana, tolerancias),
        tolerancias
      },
      pedido
    });
  } catch (error) {
    console.error('[Arribos] Error al registrar la llegada:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/llegadas/control-ausencias
 *
 * Marca AUSENTE a los pedidos que nunca registraron llegada y ya pasaron su
 * limite. Es la misma rutina que corre al listar pedidos, expuesta para
 * poder dispararla a mano o desde una tarea programada.
 *
 * Es idempotente: correrla dos veces seguidas marca cero la segunda vez.
 */
export const controlarAusencias = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tolerancias } = await obtenerConfiguracionOperativa();
    const marcados = await marcarPedidosAusentes(tolerancias);

    res.status(200).json({
      mensaje: `Pedidos marcados como AUSENTE: ${marcados}`,
      pedidosMarcados: marcados,
      limiteEnMinutos: tolerancias.ausenteMinutos
    });
  } catch (error) {
    console.error('[Arribos] Error en el control de ausencias:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
