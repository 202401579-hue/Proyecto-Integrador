import mongoose from 'mongoose';
import Pedido, { Puntualidad, PUNTUALIDADES, TipoProducto } from '../models/Pedido';
import Descarga from '../models/Descarga';
import Gateway from '../models/Gateway';
import { obtenerConfiguracionOperativa } from './configuracionOperativa';

/**
 * Cálculo de los indicadores logísticos del dashboard (sección 3 de la guía
 * de Sprint 4). Una función por indicador, cada una con su propia
 * agregación de MongoDB: así cada cálculo se puede probar y explicar por
 * separado, en lugar de traer todo a JavaScript y sumar a mano.
 *
 * El período ya llega resuelto desde el controlador (ver kpiController.ts):
 * `desde` y `hasta` son los instantes UTC que delimitan el día local
 * completo (00:00 a 23:59:59.999, hora de El Salvador), y `desdeStr`/
 * `hastaStr` son esas mismas puntas en formato AAAA-MM-DD, para los cálculos
 * que necesitan iterar día por día (minutosOperativos, volumenDiario).
 */
export interface Periodo {
  desde: Date;
  hasta: Date;
  desdeStr: string;
  hastaStr: string;
}

export const ZONA_HORARIA_EL_SALVADOR = 'America/El_Salvador';

/** Nombres reales de colecciones, leídos de los modelos en vez de escribirlos
 * sueltos: si alguna vez cambia el tercer argumento de mongoose.model(), el
 * $lookup de estas agregaciones lo sigue automáticamente. */
const COLECCION_PEDIDOS = Pedido.collection.name;

/** Redondea a un decimal, igual que los ejemplos de la sección 3.1 (23.4, 41.2). */
const redondear1 = (numero: number): number => Math.round(numero * 10) / 10;

// ---------------------------------------------------------------------------
// tiempoEspera
// ---------------------------------------------------------------------------

export interface TiempoEspera {
  promedioMinutos: number | null;
  cantidad: number;
}

/**
 * Promedio, en minutos, de (descarga.fechaHoraInicio - pedido.fechaHoraLlegadaReal),
 * para las descargas que empezaron dentro del período.
 */
export const tiempoEspera = async (periodo: Periodo): Promise<TiempoEspera> => {
  const resultado = await Descarga.aggregate<{ promedioMinutos: number; cantidad: number }>([
    {
      $match: {
        activo: true,
        fechaHoraInicio: { $gte: periodo.desde, $lte: periodo.hasta }
      }
    },
    {
      $lookup: {
        from: COLECCION_PEDIDOS,
        localField: 'pedidoId',
        foreignField: '_id',
        as: 'pedido'
      }
    },
    { $unwind: '$pedido' },
    // Un pedido sin fechaHoraLlegadaReal no debería poder llegar a DESCARGANDO,
    // pero se descarta de todas formas por si el dato quedó incompleto: una
    // resta contra null daría un NaN que arruinaría el promedio entero.
    { $match: { 'pedido.fechaHoraLlegadaReal': { $ne: null } } },
    {
      $project: {
        minutos: {
          $divide: [{ $subtract: ['$fechaHoraInicio', '$pedido.fechaHoraLlegadaReal'] }, 60000]
        }
      }
    },
    {
      $group: {
        _id: null,
        promedioMinutos: { $avg: '$minutos' },
        cantidad: { $sum: 1 }
      }
    }
  ]);

  const fila = resultado[0];

  if (!fila || fila.cantidad === 0) {
    return { promedioMinutos: null, cantidad: 0 };
  }

  return { promedioMinutos: redondear1(fila.promedioMinutos), cantidad: fila.cantidad };
};

// ---------------------------------------------------------------------------
// tiempoDescarga
// ---------------------------------------------------------------------------

export interface TiempoDescargaPorTipo {
  tipoCarga: TipoProducto;
  promedioMinutos: number | null;
  cantidad: number;
}

// Orden exacto del ejemplo de la sección 3.1: general primero, luego
// construcción (no es el orden de CATEGORIAS_PROVEEDOR, que está al revés).
const ORDEN_TIPOS_CARGA: readonly TipoProducto[] = ['general', 'construcción'];

/**
 * Promedio de duracionMinutos de las descargas finalizadas en el período,
 * agrupado por el tipoProducto del pedido. Siempre devuelve los dos tipos,
 * aunque uno tenga cantidad 0 (promedioMinutos null).
 */
export const tiempoDescarga = async (periodo: Periodo): Promise<TiempoDescargaPorTipo[]> => {
  const filas = await Descarga.aggregate<{
    _id: TipoProducto;
    promedioMinutos: number;
    cantidad: number;
  }>([
    {
      $match: {
        activo: true,
        fechaHoraFin: { $ne: null, $gte: periodo.desde, $lte: periodo.hasta }
      }
    },
    {
      $lookup: {
        from: COLECCION_PEDIDOS,
        localField: 'pedidoId',
        foreignField: '_id',
        as: 'pedido'
      }
    },
    { $unwind: '$pedido' },
    {
      $group: {
        _id: '$pedido.tipoProducto',
        promedioMinutos: { $avg: '$duracionMinutos' },
        cantidad: { $sum: 1 }
      }
    }
  ]);

  const porTipo = new Map(filas.map((fila) => [fila._id, fila]));

  return ORDEN_TIPOS_CARGA.map((tipoCarga) => {
    const fila = porTipo.get(tipoCarga);

    if (!fila || fila.cantidad === 0) {
      return { tipoCarga, promedioMinutos: null, cantidad: 0 };
    }

    return { tipoCarga, promedioMinutos: redondear1(fila.promedioMinutos), cantidad: fila.cantidad };
  });
};

// ---------------------------------------------------------------------------
// cumplimiento
// ---------------------------------------------------------------------------

export interface DistribucionPuntualidad {
  puntualidad: Puntualidad;
  cantidad: number;
  porcentaje: number;
}

export interface Cumplimiento {
  total: number;
  distribucion: DistribucionPuntualidad[];
}

// Orden exacto del ejemplo de la sección 3.1: A TIEMPO, ANTICIPADO, TARDÍO,
// AUSENTE (distinto del orden de la constante PUNTUALIDADES del modelo).
const ORDEN_PUNTUALIDADES: readonly Puntualidad[] = ['A TIEMPO', 'ANTICIPADO', 'TARDÍO', 'AUSENTE'];

/**
 * Pedidos con el campo puntualidad cargado cuya cita (inicioVentana) cae en
 * el período. Siempre las cuatro puntualidades, aunque alguna valga 0.
 */
export const cumplimiento = async (periodo: Periodo): Promise<Cumplimiento> => {
  const filas = await Pedido.aggregate<{ _id: Puntualidad; cantidad: number }>([
    {
      $match: {
        activo: true,
        puntualidad: { $in: [...PUNTUALIDADES] },
        inicioVentana: { $gte: periodo.desde, $lte: periodo.hasta }
      }
    },
    { $group: { _id: '$puntualidad', cantidad: { $sum: 1 } } }
  ]);

  const porPuntualidad = new Map(filas.map((fila) => [fila._id, fila.cantidad]));
  const total = filas.reduce((suma, fila) => suma + fila.cantidad, 0);

  const distribucion = ORDEN_PUNTUALIDADES.map((puntualidad) => {
    const cantidad = porPuntualidad.get(puntualidad) ?? 0;
    const porcentaje = total === 0 ? 0 : redondear1((cantidad / total) * 100);
    return { puntualidad, cantidad, porcentaje };
  });

  return { total, distribucion };
};

// ---------------------------------------------------------------------------
// ocupacionPorMuelle
// ---------------------------------------------------------------------------

export interface OcupacionGateway {
  numeroGateway: number;
  tipoCargaPermitida: TipoProducto;
  minutosOcupado: number;
  minutosOperativos: number;
  porcentaje: number;
}

/**
 * Minutos operativos del depósito dentro del período: (horaCierre -
 * horaApertura) * 60 por cada día hábil del período, leídos con
 * obtenerConfiguracionOperativa(). Es el mismo valor para los cinco
 * gateways porque el horario es único para todo el depósito.
 *
 * Se recorre día por día usando solo las cadenas AAAA-MM-DD (sin crear
 * fechas con hora): el día de la semana de un día calendario no depende de
 * la zona horaria, así que no hace falta tocar `Intl` ni ninguna librería
 * de fechas para esto.
 */
const minutosOperativosDelPeriodo = async (periodo: Periodo): Promise<number> => {
  const { horario } = await obtenerConfiguracionOperativa();
  const minutosPorDiaHabil = (horario.horaCierre - horario.horaApertura) * 60;

  let diasHabiles = 0;
  const cursor = new Date(`${periodo.desdeStr}T00:00:00.000Z`);
  const limite = new Date(`${periodo.hastaStr}T00:00:00.000Z`);

  while (cursor <= limite) {
    if (horario.diasHabiles.includes(cursor.getUTCDay())) {
      diasHabiles += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return diasHabiles * minutosPorDiaHabil;
};

/**
 * minutosOcupado: suma de lo que duró cada descarga del gateway dentro del
 * período. Una descarga en curso cuenta hasta ahora. Las descargas que
 * empiezan antes del período o terminan después se recortan a los bordes
 * del período, para no contar minutos que caen fuera de la ventana pedida.
 */
export const ocupacionPorMuelle = async (periodo: Periodo): Promise<OcupacionGateway[]> => {
  const ahora = new Date();
  const minutosOperativos = await minutosOperativosDelPeriodo(periodo);

  const filas = await Descarga.aggregate<{ _id: mongoose.Types.ObjectId; minutosOcupado: number }>([
    {
      $match: {
        activo: true,
        fechaHoraInicio: { $lte: periodo.hasta },
        $or: [{ fechaHoraFin: null }, { fechaHoraFin: { $gte: periodo.desde } }]
      }
    },
    {
      $project: {
        gatewayId: 1,
        // Recorta el inicio y el fin de la descarga a los bordes del
        // período: una descarga en curso usa "ahora" como fin provisional.
        inicioRecortado: { $cond: [{ $gt: ['$fechaHoraInicio', periodo.desde] }, '$fechaHoraInicio', periodo.desde] },
        finRecortado: {
          $let: {
            vars: { fin: { $ifNull: ['$fechaHoraFin', ahora] } },
            in: { $cond: [{ $lt: ['$$fin', periodo.hasta] }, '$$fin', periodo.hasta] }
          }
        }
      }
    },
    {
      $project: {
        gatewayId: 1,
        minutos: {
          $max: [0, { $divide: [{ $subtract: ['$finRecortado', '$inicioRecortado'] }, 60000] }]
        }
      }
    },
    { $group: { _id: '$gatewayId', minutosOcupado: { $sum: '$minutos' } } }
  ]);

  const porGateway = new Map(filas.map((fila) => [fila._id.toString(), fila.minutosOcupado]));

  const gateways = await Gateway.find({ activo: true }).sort({ numeroGateway: 1 }).lean();

  return gateways.map((gateway) => {
    const minutosOcupado = Math.round(porGateway.get(gateway._id.toString()) ?? 0);
    const porcentaje =
      minutosOperativos === 0 ? 0 : Math.min(100, redondear1((minutosOcupado / minutosOperativos) * 100));

    return {
      numeroGateway: gateway.numeroGateway,
      tipoCargaPermitida: gateway.tipoCargaPermitida,
      minutosOcupado,
      minutosOperativos,
      porcentaje
    };
  });
};

// ---------------------------------------------------------------------------
// volumenDiario
// ---------------------------------------------------------------------------

export interface VolumenDiario {
  fecha: string;
  finalizados: number;
}

/** Lista de fechas AAAA-MM-DD, una por cada día entre desde y hasta (incluidos). */
const diasDelPeriodo = (periodo: Periodo): string[] => {
  const dias: string[] = [];
  const cursor = new Date(`${periodo.desdeStr}T00:00:00.000Z`);
  const limite = new Date(`${periodo.hastaStr}T00:00:00.000Z`);

  while (cursor <= limite) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dias;
};

/**
 * Pedidos FINALIZADO agrupados por el día local (hora de El Salvador) de la
 * fechaHoraFin de su descarga. Devuelve un elemento por cada día del
 * período, incluidos los días en 0.
 */
export const volumenDiario = async (periodo: Periodo): Promise<VolumenDiario[]> => {
  const filas = await Descarga.aggregate<{ _id: string; finalizados: number }>([
    {
      $match: {
        activo: true,
        fechaHoraFin: { $ne: null, $gte: periodo.desde, $lte: periodo.hasta }
      }
    },
    {
      $lookup: {
        from: COLECCION_PEDIDOS,
        localField: 'pedidoId',
        foreignField: '_id',
        as: 'pedido'
      }
    },
    { $unwind: '$pedido' },
    // Si una descarga finalizó, el pedido debería estar en FINALIZADO; se
    // filtra de todas formas para seguir la letra del enunciado al pie.
    { $match: { 'pedido.estado': 'FINALIZADO' } },
    {
      $group: {
        _id: { $dateToString: { date: '$fechaHoraFin', format: '%Y-%m-%d', timezone: ZONA_HORARIA_EL_SALVADOR } },
        finalizados: { $sum: 1 }
      }
    }
  ]);

  const porDia = new Map(filas.map((fila) => [fila._id, fila.finalizados]));

  return diasDelPeriodo(periodo).map((fecha) => ({ fecha, finalizados: porDia.get(fecha) ?? 0 }));
};
