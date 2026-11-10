import { Request } from 'express';
import Descarga, { IDescarga } from '../models/Descarga';
import Gateway, { IGateway } from '../models/Gateway';
import Pedido, { EstadoPedido, ESTADOS_ELEGIBLES_DESCARGA, IPedido } from '../models/Pedido';
import { nombreDelUsuario } from './usuarioAuditoria';
import { registrarEvento } from './eventos';
import { verificarTurnoDelPedido } from './ordenCola';

/**
 * Reglas de inicio de una descarga, en un solo lugar.
 *
 * Esta logica estaba dentro del controlador, pero desde el Sprint 4 hay dos
 * caminos que inician una descarga: el endpoint POST /api/descargas/iniciar,
 * que lo pide una persona, y la promocion automatica de la cola, que ocurre
 * sola cuando se libera un gateway. Si cada camino tuviera su propia copia de
 * las validaciones, alcanzaria con corregir una sola para que la otra quedara
 * aceptando lo que no debe: por ejemplo, carga de construccion en una bahia
 * general. Por eso vive aca y los dos caminos llaman a la misma funcion.
 *
 * El servicio no toca `res`: devuelve un resultado y quien llama decide si
 * eso es una respuesta HTTP o una linea de log. Es lo que permite que la
 * promocion lo reutilice, porque ahi no hay ninguna respuesta que mandar.
 */

/** Populate que llevan el inicio, la finalizacion y el listado de activas. */
export const POPULATE_PEDIDO = { path: 'pedidoId', populate: { path: 'proveedorId' } } as const;

export const MENSAJE_PEDIDO_NO_ENCONTRADO = 'El pedido indicado no existe o está inactivo';
export const MENSAJE_GATEWAY_NO_ENCONTRADO = 'El gateway indicado no existe o está inactivo';

export type ResultadoInicio = ResultadoIniciado | ResultadoRechazado;

export interface ResultadoRechazado {
  tipo: 'rechazado';
  estado: number;
  mensaje: string;
  /** Solo lo llena el rechazo por orden de turno (ver iniciarDescargaDePedido). */
  pedidoSugerido?: { pedidoId: string; numeroPedido: string; prioridadCalculada: number };
}

export type ResultadoIniciado = { tipo: 'iniciada'; descarga: IDescarga; gateway: IGateway; pedido: IPedido };

interface OpcionesInicio {
  /**
   * true cuando la inicia la promocion de la cola y no una persona. Solo
   * cambia los detalles de los eventos: las validaciones son las mismas,
   * justamente para que lo automatico no pueda romper una regla que lo
   * manual respeta.
   */
  automatica?: boolean;
}

/**
 * Inicia una descarga de un pedido en un gateway.
 *
 * Orden: pedido y gateway existen y estan activos -> el pedido esta en un
 * estado elegible -> el tipo de carga es compatible (RN-07/RN-08) -> ocupar
 * el gateway -> pasar el pedido a DESCARGANDO -> crear la descarga.
 *
 * Los tres ultimos pasos son actualizaciones condicionales (findOneAndUpdate
 * con el estado esperado en el filtro) en lugar de una transaccion: el
 * MongoDB local instalado no soporta transacciones entre varios documentos,
 * porque eso requiere un replica set. El orden es seguro igual, porque cada
 * paso solo avanza si el anterior se confirmo, y si un paso falla se revierte
 * el que ya se habia hecho antes de devolver el rechazo.
 */
export const iniciarDescargaDePedido = async (
  req: Request,
  pedidoId: string,
  gatewayId: string,
  opciones: OpcionesInicio = {}
): Promise<ResultadoInicio> => {
  const [pedido, gateway] = await Promise.all([
    Pedido.findOne({ _id: pedidoId, activo: true }),
    Gateway.findOne({ _id: gatewayId, activo: true })
  ]);

  if (!pedido) {
    return { tipo: 'rechazado', estado: 404, mensaje: MENSAJE_PEDIDO_NO_ENCONTRADO };
  }

  if (!gateway) {
    return { tipo: 'rechazado', estado: 404, mensaje: MENSAJE_GATEWAY_NO_ENCONTRADO };
  }

  // El pedido tiene que haber llegado y estar esperando bahia. Se valida en
  // el servidor, no solo filtrando en la pantalla: es lo que impide descargar
  // un pedido que no llego, o el mismo pedido en dos bahias a la vez.
  if (!ESTADOS_ELEGIBLES_DESCARGA.includes(pedido.estado)) {
    return {
      tipo: 'rechazado',
      estado: 400,
      mensaje: `No se puede iniciar una descarga: el pedido está en estado ${pedido.estado}`
    };
  }

  // RN-07 / RN-08: el tipo de producto tiene que coincidir con el tipo de
  // carga de la bahia.
  if (pedido.tipoProducto !== gateway.tipoCargaPermitida) {
    return {
      tipo: 'rechazado',
      estado: 400,
      mensaje: `El gateway ${gateway.numeroGateway} solo admite carga "${gateway.tipoCargaPermitida}"`
    };
  }

  // Orden estricto de la cola (Sprint 6): un pedido EN COLA no puede
  // saltarse al que le corresponde atenderse primero en este gateway. Los
  // estados que ESTADOS_ELEGIBLES_DESCARGA acepta por compatibilidad con
  // pedidos anteriores al Sprint 4 (ANTICIPADO, A TIEMPO, TARDÍO) no pasan
  // por esta regla: conservan su comportamiento de siempre. Tampoco afecta
  // a la promocion automatica, que llama a su propio flujo y nunca pasa por
  // aca (ver promoverSiguienteDeLaCola).
  if (pedido.estado === 'EN COLA') {
    const { permitido, siguiente } = await verificarTurnoDelPedido(String(pedido._id), gateway);

    if (!permitido && siguiente) {
      return {
        tipo: 'rechazado',
        estado: 409,
        mensaje: `Debe atenderse primero el pedido ${siguiente.numeroPedido} (prioridad ${siguiente.prioridadCalculada}, ${siguiente.minutosEnEspera} min en espera)`,
        pedidoSugerido: {
          pedidoId: siguiente._id,
          numeroPedido: siguiente.numeroPedido,
          prioridadCalculada: siguiente.prioridadCalculada
        }
      };
    }
  }

  // Ocupar el gateway con una sola actualizacion condicional: si otra
  // peticion lo ocupo primero, o ya no esta LIBRE, devuelve null. Asi dos
  // coordinadores que aprietan a la vez nunca ocupan la misma bahia.
  const gatewayOcupado = await Gateway.findOneAndUpdate(
    { _id: gateway._id, activo: true, estado: 'LIBRE' },
    { estado: 'OCUPADO' },
    { new: true }
  );

  if (!gatewayOcupado) {
    return {
      tipo: 'rechazado',
      estado: 400,
      mensaje: 'El gateway no está disponible: ya fue ocupado o no está LIBRE'
    };
  }

  // Pasar el pedido a DESCARGANDO, condicionado a que siga en un estado
  // elegible.
  const estadoAnteriorDelPedido = pedido.estado;

  const pedidoDescargando = await Pedido.findOneAndUpdate(
    { _id: pedido._id, activo: true, estado: { $in: ESTADOS_ELEGIBLES_DESCARGA } },
    { estado: 'DESCARGANDO' },
    { new: true }
  );

  if (!pedidoDescargando) {
    // El gateway ya se habia ocupado: se revierte, nadie quedo usandolo.
    await Gateway.findByIdAndUpdate(gateway._id, { estado: 'LIBRE' });
    return {
      tipo: 'rechazado',
      estado: 400,
      mensaje: 'El pedido ya no está disponible para iniciar una descarga'
    };
  }

  return crearDescargaYRegistrarEventos(req, pedidoDescargando, gatewayOcupado, estadoAnteriorDelPedido, {
    automatica: opciones.automatica === true
  });
};

/**
 * Ultimo tramo, comun a los dos caminos que inician una descarga: el pedido
 * ya quedo en DESCARGANDO y el gateway ya quedo OCUPADO (sin importar en que
 * orden se consiguieron los dos), falta crear el documento de Descarga y
 * registrar los eventos.
 *
 * Si la creacion de la Descarga falla, revierte los dos a como estaban
 * antes: el pedido a `estadoAnteriorDelPedido` y el gateway a LIBRE.
 *
 * Exportado: services/promocionCola.ts (promoverSiguienteDeLaCola) tambien
 * lo usa, porque llega a este mismo punto por el otro orden (reclama el
 * pedido primero y el gateway despues).
 */
export const crearDescargaYRegistrarEventos = async (
  req: Request,
  pedido: IPedido,
  gatewayOcupado: IGateway,
  estadoAnteriorDelPedido: EstadoPedido,
  opciones: { automatica: boolean }
): Promise<ResultadoIniciado> => {
  let descarga: IDescarga;

  try {
    descarga = await Descarga.create({
      gatewayId: gatewayOcupado._id,
      pedidoId: pedido._id,
      operadorId: req.usuario?.id,
      fechaHoraInicio: new Date(),
      usuarioCreacion: await nombreDelUsuario(req)
    });
  } catch (error) {
    // La descarga no se pudo crear: se revierten el pedido y el gateway a
    // como estaban antes de esta operacion.
    await Pedido.findByIdAndUpdate(pedido._id, { estado: estadoAnteriorDelPedido });
    await Gateway.findByIdAndUpdate(gatewayOcupado._id, { estado: 'LIBRE' });
    throw error;
  }

  const descargaPoblada = await Descarga.findById(descarga._id)
    .populate('gatewayId')
    .populate(POPULATE_PEDIDO);

  // Los eventos van al final, con la operacion ya cerrada (ver
  // services/eventos.ts para por que un evento que falla no la deshace).
  //
  // Son dos y no uno porque son dos hechos distintos: la bahia quedo
  // asignada a ese pedido, y la descarga arranco. Separados, la bitacora
  // puede responder "que paso con el gateway 3" sin leer las descargas.
  const detallesComunes = {
    numeroGateway: gatewayOcupado.numeroGateway,
    numeroPedido: pedido.numeroPedido,
    tipoCarga: gatewayOcupado.tipoCargaPermitida,
    // Deja constancia de si la inicio una persona o la promocion de la cola.
    automatica: opciones.automatica
  };

  await registrarEvento(req, 'GATEWAY_ASIGNADO', {
    pedidoId: pedido._id,
    detalles: { ...detallesComunes, estadoAnteriorDelPedido }
  });

  await registrarEvento(req, 'DESCARGA_INICIADA', {
    pedidoId: pedido._id,
    detalles: { ...detallesComunes, descargaId: String(descarga._id) }
  });

  return {
    tipo: 'iniciada',
    descarga: descargaPoblada ?? descarga,
    gateway: gatewayOcupado,
    pedido
  };
};

