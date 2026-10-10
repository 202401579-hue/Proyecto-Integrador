import Pedido from '../models/Pedido';
import { Tolerancias } from './puntualidad';

/**
 * Control de ausencias: marca AUSENTE a los pedidos que nunca registraron
 * llegada y ya pasaron su limite.
 *
 * El problema: un pedido AUSENTE no lo dispara ninguna accion del usuario.
 * Los otros estados los provoca alguien (programar, registrar la llegada,
 * cancelar), pero "no vino nadie" es la ausencia de un evento, y no hay nada
 * que ejecutar en ese momento.
 *
 * La solucion elegida es marcarlos de forma perezosa: esta funcion corre al
 * listar pedidos y tambien se puede disparar a mano con
 * POST /api/llegadas/control-ausencias. No hace falta un proceso aparte
 * (cron, agenda o un setInterval en el servidor), que ademas se complicaria
 * con varias instancias del backend levantadas.
 *
 * La consecuencia es que un pedido "se convierte" en AUSENTE cuando alguien
 * mira la lista, no en el minuto exacto del vencimiento. No se pierde
 * informacion: el estado se deduce de inicioVentana y del margen, asi que la
 * respuesta que ve el usuario siempre esta al dia. Si mas adelante se quiere
 * marcar en el instante justo, alcanza con que el Programador de tareas de
 * Windows o un cron le pegue al endpoint cada pocos minutos: la operacion es
 * idempotente y solo toca lo que corresponde.
 */
export const marcarPedidosAusentes = async (tolerancias: Tolerancias): Promise<number> => {
  // Todo pedido cuya ventana empezo antes de este momento ya vencio.
  const limite = new Date(Date.now() - tolerancias.ausenteMinutos * 60 * 1000);

  const resultado = await Pedido.updateMany(
    {
      activo: true,
      // Solo los que siguen esperando: si ya cambio de estado, alguien
      // registro su llegada y no corresponde tocarlo.
      estado: 'PROGRAMADO',
      fechaHoraLlegadaReal: { $exists: false },
      inicioVentana: { $lt: limite }
    },
    {
      $set: {
        estado: 'AUSENTE',
        // La ausencia tambien es una forma de puntualidad, y se guarda en su
        // propio campo por la misma razon que las otras tres: el estado de un
        // AUSENTE puede cambiar despues (al reprogramarlo vuelve a
        // PROGRAMADO), y sin este campo se perderia el dato de que ese
        // proveedor falto, que es justo lo que mide el cumplimiento.
        puntualidad: 'AUSENTE',
        // No hay un usuario detras de esta escritura: la decide el sistema
        // al ver que el plazo vencio. Se deja dicho asi en la auditoria.
        usuarioActualizacion: 'Sistema (control de ausencias)'
      }
    }
  );

  if (resultado.modifiedCount > 0) {
    console.log(`[Arribos] Pedidos marcados como AUSENTE: ${resultado.modifiedCount}`);
  }

  return resultado.modifiedCount;
};
