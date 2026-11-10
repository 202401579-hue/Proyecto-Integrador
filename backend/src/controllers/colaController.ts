import { Request, Response } from 'express';
import { obtenerColaOrdenada, reevaluarCola } from '../services/cola';

/**
 * GET /api/cola
 *
 * Cola de descarga ordenada por prioridad (Sprint 6). Solo lectura: no
 * escribe nada en la base ni crea eventos, a diferencia de /reevaluar.
 */
export const obtenerCola = async (_req: Request, res: Response): Promise<void> => {
  try {
    const cola = await obtenerColaOrdenada();
    res.status(200).json(cola);
  } catch (error) {
    console.error('[Cola] Error al obtener la cola:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/cola/reevaluar
 *
 * Recalcula la prioridad de todos los pedidos EN COLA, guarda el resultado
 * y registra AGING_APLICADO para los que subieron de nivel.
 */
export const reevaluar = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuarioId = req.usuario?.id;

    // Las rutas del modulo pasan por verificarToken, asi que esto no deberia
    // ocurrir; se cubre igual para no intentar registrar eventos sin usuario.
    if (!usuarioId) {
      res.status(401).json({ mensaje: 'No se proporcionó un token' });
      return;
    }

    const resultado = await reevaluarCola(usuarioId);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('[Cola] Error al reevaluar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
