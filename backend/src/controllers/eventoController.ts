import { Request, Response } from 'express';
import mongoose, { QueryFilter } from 'mongoose';
import Evento, { ACCIONES_EVENTO, AccionEvento, IEvento } from '../models/Evento';

/**
 * Consulta de la bitacora de eventos (RN-14).
 *
 * Este controlador solo lee. No tiene crear, actualizar ni inactivar, y no
 * es un olvido: los eventos los escribe el backend como consecuencia de
 * una operacion real (ver services/eventos.ts), nunca un cliente. Si
 * hubiera un POST, cualquiera con un token podria inventar una linea de
 * auditoria, que es exactamente lo que RN-14 quiere evitar.
 */

/** Rango de fechas pedido por query. Las dos puntas son opcionales. */
interface RangoFechas {
  desde?: Date;
  hasta?: Date;
}

/**
 * Interpreta ?desde= y ?hasta=. Devuelve null si alguna no es una fecha
 * valida, para que el controlador responda 400 en lugar de devolver una
 * lista vacia que haria pensar que no hay eventos.
 */
const interpretarRango = (req: Request): RangoFechas | null => {
  const rango: RangoFechas = {};

  for (const nombre of ['desde', 'hasta'] as const) {
    const valor = req.query[nombre];

    if (valor === undefined || valor === '') {
      continue;
    }

    if (typeof valor !== 'string') {
      return null;
    }

    const fecha = new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
      return null;
    }

    rango[nombre] = fecha;
  }

  return rango;
};

/**
 * GET /api/eventos
 *
 * Filtros opcionales y combinables: ?pedidoId=, ?accion=, ?desde=, ?hasta=.
 *
 * Devuelve del mas reciente al mas viejo, que es el orden en que se mira
 * una bitacora: lo que acaba de pasar interesa primero.
 */
export const listarEventos = async (req: Request, res: Response): Promise<void> => {
  try {
    const filtro: QueryFilter<IEvento> = {};

    // --- ?pedidoId= ---
    const { pedidoId, accion } = req.query;

    if (pedidoId !== undefined && pedidoId !== '') {
      if (typeof pedidoId !== 'string' || !mongoose.isValidObjectId(pedidoId)) {
        res.status(400).json({ mensaje: 'El identificador del pedido no es válido' });
        return;
      }

      filtro.pedidoId = pedidoId;
    }

    // --- ?accion= ---
    if (accion !== undefined && accion !== '') {
      // Se valida contra la lista cerrada en lugar de pasarla tal cual: una
      // accion mal escrita devolveria cero eventos y parece "no pasó nada",
      // cuando en realidad el filtro estaba mal.
      const accionPedida = accion as AccionEvento;

      if (typeof accion !== 'string' || !ACCIONES_EVENTO.includes(accionPedida)) {
        res.status(400).json({
          mensaje: `La acción debe ser una de: ${ACCIONES_EVENTO.join(', ')}`
        });
        return;
      }

      filtro.accion = accionPedida;
    }

    // --- ?desde= y ?hasta= ---
    const rango = interpretarRango(req);

    if (!rango) {
      res.status(400).json({ mensaje: 'desde y hasta deben ser fechas válidas' });
      return;
    }

    if (rango.desde || rango.hasta) {
      filtro.fechaHora = {
        ...(rango.desde ? { $gte: rango.desde } : {}),
        ...(rango.hasta ? { $lte: rango.hasta } : {})
      };
    }

    const eventos = await Evento.find(filtro)
      .sort({ fechaHora: -1 })
      // El nombre y el rol de quien lo hizo, y el numero del pedido: es lo
      // que una pantalla de auditoria necesita mostrar sin pedir mas datos.
      .populate('usuarioId', 'nombre rol')
      .populate('pedidoId', 'numeroPedido');

    res.status(200).json(eventos);
  } catch (error) {
    console.error('[Eventos] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
