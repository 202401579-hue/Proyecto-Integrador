import { Request } from 'express';
import { Types } from 'mongoose';
import Evento, { AccionEvento, IEvento } from '../models/Evento';
import { nombreDelUsuario } from './usuarioAuditoria';

/**
 * Registro de eventos de la bitacora (RN-14).
 *
 * Esta es la unica forma en que el resto del backend escribe en la
 * coleccion eventos. Los controladores no importan el modelo: llaman a
 * registrarEvento() y se olvidan de como se arma el documento.
 *
 * REGLA IMPORTANTE: se llama SIEMPRE despues de que la operacion de
 * negocio ya salio bien, nunca antes ni "en paralelo". Un evento afirma
 * que algo paso; si se registrara primero y la operacion fallara, la
 * bitacora diria que una descarga empezo cuando en realidad no empezo.
 *
 * Y AL REVES: si la operacion sale bien pero guardar el evento falla, la
 * operacion NO se deshace. El razonamiento es de prioridades: lo que el
 * negocio necesita es que el camion quede registrado descargando en su
 * bahia. Perder una linea de la bitacora es malo, pero deshacer una
 * descarga real que ya ocurrio -- dejando el gateway libre con un camion
 * adentro -- es peor, y ademas desharia algo correcto por un fallo de un
 * registro secundario. Por eso el error se atrapa, se deja el detalle
 * completo en consola para poder reconstruirlo a mano, y la peticion
 * sigue su curso y responde exito.
 */

interface OpcionesEvento {
  pedidoId?: Types.ObjectId | string;
  detalles?: Record<string, unknown>;
}

/**
 * Devuelve el evento guardado, o null si no se pudo guardar.
 *
 * El null es informativo: quien llama puede ignorarlo tranquilo, porque
 * un evento perdido no cambia el resultado de la operacion.
 */
export const registrarEvento = async (
  req: Request,
  accion: AccionEvento,
  opciones: OpcionesEvento = {}
): Promise<IEvento | null> => {
  try {
    const usuarioId = req.usuario?.id;

    // Todas las rutas que registran eventos pasan por verificarToken, asi
    // que esto no deberia ocurrir. Se cubre igual porque usuarioId es
    // obligatorio en el modelo: sin el, el save fallaria con un error de
    // validacion que no dice nada util en el log.
    if (!usuarioId) {
      console.error(
        `[Eventos] No se registró ${accion}: la petición no trae usuario autenticado.`
      );
      return null;
    }

    return await Evento.create({
      usuarioId,
      pedidoId: opciones.pedidoId,
      accion,
      detalles: opciones.detalles ?? {},
      // Hora del servidor, igual que el resto de las fechas del sistema.
      fechaHora: new Date(),
      usuarioCreacion: await nombreDelUsuario(req)
    });
  } catch (error) {
    // Se registra el error completo, no solo el message: si el evento se
    // perdio, esta linea del log es lo unico que queda para reconstruirlo.
    console.error(`[Eventos] No se pudo registrar ${accion}. La operación sí se completó.`, {
      accion,
      pedidoId: opciones.pedidoId,
      detalles: opciones.detalles,
      error
    });
    return null;
  }
};
