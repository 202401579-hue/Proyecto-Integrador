import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Pedido from '../models/Pedido';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { obtenerConfiguracionOperativa } from '../services/configuracionOperativa';
import { clasificarLlegada, limiteDeAusencia, minutosDeDiferencia } from '../services/puntualidad';
import { marcarPedidosAusentes } from '../services/controlAusencias';
import { registrarEvento } from '../services/eventos';

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
 * puntualidad (ANTICIPADO, A TIEMPO, TARDÍO o AUSENTE) y se guarda en el
 * campo puntualidad del pedido, junto con fechaHoraLlegadaReal.
 *
 * Desde el Sprint 4 el estado pasa a EN COLA en lugar de quedarse con la
 * clasificacion: el camion ya esta en el deposito esperando bahia, y la
 * puntualidad vive en su propio campo (ver models/Pedido.ts).
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
        estado: pedido.estado,
        // Se suma a la respuesta porque desde el Sprint 4 el estado ya no
        // dice con que puntualidad llego: puede ser EN COLA, DESCARGANDO o
        // FINALIZADO. Sin este campo, quien recibe el 409 no podria saberlo.
        puntualidad: pedido.puntualidad
      });
      return;
    }

    const { tolerancias } = await obtenerConfiguracionOperativa();

    // Hora del servidor, igual que el resto de las fechas del sistema.
    const llegada = new Date();
    const puntualidad = clasificarLlegada(llegada, pedido.inicioVentana, tolerancias);

    pedido.fechaHoraLlegadaReal = llegada;
    // La clasificacion va a su propio campo y ya no al estado. El estado
    // sigue avanzando despues (DESCARGANDO, FINALIZADO) y se llevaria la
    // puntualidad puesta; guardada aparte, queda para siempre.
    pedido.puntualidad = puntualidad;
    // El camion llego y espera bahia: eso es EN COLA. Es tambien el estado
    // desde el que la promocion automatica lo va a tomar cuando se libere
    // un gateway compatible.
    pedido.estado = 'EN COLA';
    pedido.usuarioActualizacion = await nombreDelUsuario(req);

    await pedido.save();
    await pedido.populate('proveedorId');

    const diferencia = minutosDeDiferencia(llegada, pedido.inicioVentana);

    // La llegada ya quedo guardada: el evento se registra despues (ver
    // services/eventos.ts para por que un evento que falla no la deshace).
    await registrarEvento(req, 'LLEGADA_REGISTRADA', {
      pedidoId: pedido._id,
      detalles: {
        numeroPedido: pedido.numeroPedido,
        puntualidad,
        // Se guarda el dato crudo y no solo la clasificacion: si manana se
        // ajustan las tolerancias en parametros, la bitacora todavia permite
        // saber cuantos minutos tarde llego ese camion en realidad.
        minutosDeDiferencia: diferencia,
        inicioVentana: pedido.inicioVentana
      }
    });

    res.status(200).json({
      mensaje: `Llegada registrada: ${puntualidad}`,
      clasificacion: {
        // El nombre del campo no cambia y sigue trayendo la puntualidad: es
        // lo que muestra la caseta de arribos, y cambiarlo rompería la
        // pantalla sin necesidad. Lo que cambio es de donde sale el dato.
        estado: puntualidad,
        // Negativo si llego antes de la hora, positivo si llego despues.
        // Se devuelve para que el frontend pueda explicar el estado sin
        // tener que recalcular nada ni conocer los margenes.
        minutosDeDiferencia: diferencia,
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
