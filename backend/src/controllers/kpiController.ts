import { Request, Response } from 'express';
import {
  Periodo,
  ZONA_HORARIA_EL_SALVADOR,
  cumplimiento,
  ocupacionPorMuelle,
  tiempoDescarga,
  tiempoEspera,
  volumenDiario
} from '../services/kpis';

/**
 * GET /api/kpis (sección 3 de la guía de Sprint 4).
 *
 * Arma la respuesta llamando a las cinco funciones de services/kpis.ts, una
 * por indicador. El cálculo de cada una vive allá; este controlador solo
 * valida el rango de fechas, aplica el valor por defecto y junta el
 * resultado en la forma exacta de la sección 3.1.
 */

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Cuántos días completos, incluido hoy, abarca el rango por defecto. */
const DIAS_POR_DEFECTO = 7;

/**
 * Devuelve la fecha de hoy en El Salvador, como AAAA-MM-DD. Se usa
 * Intl con la zona horaria explícita en vez de la hora del servidor:
 * este contenedor puede correr en cualquier zona, y "hoy" tiene que ser el
 * día local del depósito, no el de la máquina.
 */
const hoyEnElSalvador = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_EL_SALVADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

/** Suma (o resta, con un número negativo) días a una fecha AAAA-MM-DD. */
const sumarDias = (fecha: string, dias: number): string => {
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + dias);
  return fechaUtc.toISOString().slice(0, 10);
};

/**
 * Valida que el texto tenga el formato AAAA-MM-DD y que sea una fecha
 * calendario real (rechaza, por ejemplo, 2026-02-30: Date normaliza en vez
 * de fallar, así que no alcanza con un new Date().getTime()).
 */
const esFechaCalendarioValida = (texto: string): boolean => {
  if (!FORMATO_FECHA.test(texto)) {
    return false;
  }

  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
};

/**
 * Interpreta ?desde= y ?hasta=, aplicando el valor por defecto (últimos 7
 * días, incluido hoy) cuando faltan. Devuelve null si el formato es
 * inválido, la fecha no existe en el calendario, o desde es posterior a
 * hasta: en los tres casos el controlador responde 400.
 */
const interpretarPeriodo = (req: Request): { desdeStr: string; hastaStr: string } | null => {
  const { desde, hasta } = req.query;

  if (desde !== undefined && typeof desde !== 'string') return null;
  if (hasta !== undefined && typeof hasta !== 'string') return null;

  const hoy = hoyEnElSalvador();
  const hastaStr = hasta && hasta !== '' ? hasta : hoy;
  const desdeStr = desde && desde !== '' ? desde : sumarDias(hastaStr, -(DIAS_POR_DEFECTO - 1));

  if (!esFechaCalendarioValida(desdeStr) || !esFechaCalendarioValida(hastaStr)) {
    return null;
  }

  // Comparación de texto: el formato AAAA-MM-DD tiene ancho fijo, así que
  // compara igual que las fechas reales que representa.
  if (desdeStr > hastaStr) {
    return null;
  }

  return { desdeStr, hastaStr };
};

/**
 * Convierte las puntas AAAA-MM-DD en el día local completo que describe la
 * guía: desde las 00:00 de "desde" hasta las 23:59:59.999 de "hasta", hora
 * de El Salvador (UTC-6, sin horario de verano). Se escribe el offset
 * explícito en el string ISO para no depender de la zona horaria del
 * servidor que corre este código.
 */
const aPeriodo = (desdeStr: string, hastaStr: string): Periodo => ({
  desde: new Date(`${desdeStr}T00:00:00.000-06:00`),
  hasta: new Date(`${hastaStr}T23:59:59.999-06:00`),
  desdeStr,
  hastaStr
});

/**
 * GET /api/kpis
 *
 * Roles: Administrador y Coordinador (el Operador queda afuera por la
 * ruta, ver kpiRoutes.ts). Query opcional ?desde=&hasta=, fechas locales de
 * El Salvador; por defecto, los últimos 7 días incluido hoy. 400 si una
 * fecha es inválida o desde es posterior a hasta.
 */
export const obtenerKpis = async (req: Request, res: Response): Promise<void> => {
  try {
    const rango = interpretarPeriodo(req);

    if (!rango) {
      res.status(400).json({ mensaje: 'desde y hasta deben ser fechas AAAA-MM-DD válidas, y desde no puede ser posterior a hasta' });
      return;
    }

    const periodo = aPeriodo(rango.desdeStr, rango.hastaStr);

    const [espera, descarga, cumplimientoResultado, ocupacion, volumen] = await Promise.all([
      tiempoEspera(periodo),
      tiempoDescarga(periodo),
      cumplimiento(periodo),
      ocupacionPorMuelle(periodo),
      volumenDiario(periodo)
    ]);

    res.status(200).json({
      periodo: {
        desde: periodo.desdeStr,
        hasta: periodo.hastaStr,
        zonaHoraria: ZONA_HORARIA_EL_SALVADOR
      },
      tiempoEspera: espera,
      tiempoDescarga: descarga,
      cumplimiento: cumplimientoResultado,
      ocupacionPorMuelle: ocupacion,
      volumenDiario: volumen
    });
  } catch (error) {
    console.error('[KPIs] Error al calcular:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
