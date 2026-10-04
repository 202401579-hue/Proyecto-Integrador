import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Pedido, {
  ESTADOS_QUE_OCUPAN_FRANJA,
  IPedido,
  TIPOS_PRODUCTO,
  TipoProducto
} from '../models/Pedido';
import Proveedor, { normalizarNFC } from '../models/Proveedor';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { filtroActivos } from '../services/borradoLogico';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';
import {
  HorarioOperativo,
  VentanaHoraria,
  buscarAlternativas,
  calcularVentana,
  esDiaHabil,
  estaDentroDelHorario,
  limitesDelDia,
  seSolapan,
  textoDiasHabiles,
  textoHorario
} from '../services/ventanaHoraria';
import { obtenerConfiguracionOperativa } from '../services/configuracionOperativa';
import { marcarPedidosAusentes } from '../services/controlAusencias';
import { generarNumeroPedido } from '../services/numeroPedido';

// Cantidad de ventanas libres que se ofrecen cuando hay solapamiento,
// y hasta cuantos dias hacia adelante se buscan.
const CANTIDAD_ALTERNATIVAS = 3;
const DIAS_BUSQUEDA_ALTERNATIVAS = 7;

const MENSAJE_DUPLICADO = 'Ya existe un pedido con ese número de pedido';
const MENSAJE_NO_ENCONTRADO = 'El pedido indicado no existe o está inactivo';
const MENSAJE_SOLAPE = 'La ventana horaria se solapa con otro pedido ya programado';

/**
 * Estados del ciclo de descarga (Sprint 3): mientras el pedido esta en uno
 * de estos, no se edita ni se inactiva. Editar un pedido EN COLA o
 * DESCARGANDO podria pisar datos que la descarga esta usando, e inactivar
 * uno DESCARGANDO dejaria su gateway OCUPADO para siempre, sin manera de
 * finalizarlo.
 */
const ESTADOS_BLOQUEADOS_EDICION = ['EN COLA', 'DESCARGANDO', 'FINALIZADO'];

/**
 * Cola de altas de pedidos: cada alta espera a que termine la anterior.
 *
 * Revisar el solapamiento y guardar son dos pasos con un await en el medio.
 * Si dos coordinadores reservan el mismo horario a la vez, ambos podrian
 * consultar antes de que el otro guarde, no ver ningun choque y quedar los
 * dos pedidos superpuestos. Encadenando las altas, la segunda consulta ya
 * ve el pedido que guardo la primera y recibe el 409.
 *
 * Alcanza porque el backend corre como un unico proceso. Si algun dia se
 * levantan varias instancias, habria que pasar a una transaccion de MongoDB.
 */
let colaDeAltas: Promise<unknown> = Promise.resolve();

const ejecutarEnSerie = <T>(tarea: () => Promise<T>): Promise<T> => {
  const resultado = colaDeAltas.then(tarea);
  // Si una tarea falla, la cola sigue: la siguiente alta no hereda el error.
  colaDeAltas = resultado.catch(() => undefined);
  return resultado;
};

type Alternativa = { inicioVentana: Date; finVentana: Date };

type ResultadoAlta =
  | { tipo: 'solape'; alternativas: Alternativa[] }
  | { tipo: 'creado'; pedido: IPedido };

type ResultadoReprogramacion =
  | { tipo: 'solape'; alternativas: Alternativa[] }
  | { tipo: 'reprogramado'; pedido: IPedido };

/**
 * Busca si la ventana pedida choca con algun pedido que ocupe la franja y,
 * si choca, arma las alternativas libres para ofrecerlas.
 *
 * La comparten el alta y la reprogramacion, que tienen exactamente la misma
 * regla. `excluirId` sirve para la reprogramacion: el pedido que se esta
 * moviendo no tiene que chocar consigo mismo.
 *
 * Devuelve null si la ventana esta libre.
 */
const buscarSolapamiento = async (
  ventana: VentanaHoraria,
  duracion: number,
  horario: HorarioOperativo,
  excluirId?: unknown
): Promise<Alternativa[] | null> => {
  // Se traen de una vez los pedidos desde el dia pedido hasta el ultimo dia en
  // que se buscarian alternativas. Los del mismo dia se usan para detectar el
  // solape; el resto, solo si hace falta ofrecer alternativas.
  const { inicio: aperturaDelDia } = limitesDelDia(ventana.inicio, horario);
  const finBusqueda = new Date(aperturaDelDia.getTime());
  finBusqueda.setDate(finBusqueda.getDate() + DIAS_BUSQUEDA_ALTERNATIVAS + 1);

  // Se filtra por los estados que todavia ocupan la franja (ver el modelo):
  // un pedido cancelado o ausente libera su horario. Lo mismo activo: true,
  // que deja afuera los dados de baja.
  const filtro: Record<string, unknown> = {
    estado: { $in: ESTADOS_QUE_OCUPAN_FRANJA },
    activo: true,
    inicioVentana: { $lt: finBusqueda },
    finVentana: { $gt: aperturaDelDia }
  };

  if (excluirId) {
    filtro._id = { $ne: excluirId };
  }

  const pedidosProgramados = await Pedido.find(filtro).select('inicioVentana finVentana');

  const ocupadas: VentanaHoraria[] = pedidosProgramados.map((pedido) => ({
    inicio: pedido.inicioVentana,
    fin: pedido.finVentana
  }));

  if (!ocupadas.some((ocupada) => seSolapan(ventana, ocupada))) {
    return null;
  }

  // Las alternativas arrancan en la hora pedida o en este momento,
  // lo que sea mas tarde, para no ofrecer horarios que ya pasaron.
  const ahora = new Date();
  const desde = ventana.inicio > ahora ? ventana.inicio : ahora;

  return buscarAlternativas(
    desde,
    duracion,
    ocupadas,
    horario,
    CANTIDAD_ALTERNATIVAS,
    DIAS_BUSQUEDA_ALTERNATIVAS
  ).map((alternativa) => ({
    inicioVentana: alternativa.inicio,
    finVentana: alternativa.fin
  }));
};

/**
 * Valida que la ventana sea programable: ni en el pasado, ni en un dia sin
 * atencion, ni fuera del horario operativo. Devuelve true si ya respondio.
 */
const respondioVentanaInvalida = (
  ventana: VentanaHoraria,
  horario: HorarioOperativo,
  res: Response
): boolean => {
  // No se programan pedidos en el pasado: nadie puede recibir una entrega
  // en un horario que ya transcurrio.
  if (ventana.inicio < new Date()) {
    res.status(400).json({ mensaje: 'No se puede programar un pedido en una fecha pasada' });
    return true;
  }

  // El deposito no atiende todos los dias. Se responde antes que el horario
  // para que el mensaje explique el problema real: decirle "fuera del horario
  // 07:00 a 17:00" a quien programo un domingo a las 09:00 lo dejaria mirando
  // el reloj en lugar del calendario.
  if (!esDiaHabil(ventana.inicio, horario)) {
    res.status(400).json({
      mensaje: `El pedido debe programarse en un día de atención (${textoDiasHabiles(horario)})`
    });
    return true;
  }

  if (!estaDentroDelHorario(ventana, horario)) {
    res.status(400).json({
      mensaje: `El pedido debe programarse dentro del horario operativo (${textoHorario(
        horario
      )})`
    });
    return true;
  }

  return false;
};

/**
 * POST /api/pedidos
 *
 * Recibe { numeroPedido, proveedorId, tipoProducto, fechaHoraProgramada,
 * duracionEstimadaMinutos }, calcula inicioVentana y finVentana, y guarda
 * el pedido como PROGRAMADO (201).
 *
 * Orden de validacion:
 *   1. campos obligatorios y formato                   -> 400
 *      tipoProducto dentro de la lista cerrada          -> 400
 *   2. que el proveedor exista                          -> 400
 *      que el numeroPedido no este repetido             -> 400
 *   3. calcular la ventana
 *   4. que no sea una fecha pasada                      -> 400
 *      dia habil y horario operativo                    -> 400
 *      solapamiento con los pedidos programados del dia -> 409 + alternativas
 *   5. guardar                                          -> 201
 */
export const crearPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      proveedorId,
      tipoProducto,
      fechaHoraProgramada,
      duracionEstimadaMinutos
    } = req.body ?? {};

    // 1. Campos obligatorios. Se compara contra undefined/null/'' y no con !valor,
    // porque !0 es true y una duracion 0 tiene que caer en el mensaje de formato.
    // numeroPedido ya no esta aca: se genera en el servidor, no lo manda el cliente.
    const faltaCampo = [
      proveedorId,
      tipoProducto,
      fechaHoraProgramada,
      duracionEstimadaMinutos
    ].some((valor) => valor === undefined || valor === null || String(valor).trim() === '');

    if (faltaCampo) {
      res.status(400).json({
        mensaje:
          'proveedorId, tipoProducto, fechaHoraProgramada y duracionEstimadaMinutos son obligatorios'
      });
      return;
    }

    // Lista cerrada, igual que la categoria del proveedor. Se normaliza la
    // tilde antes de comparar (ver normalizarNFC en el modelo Proveedor).
    const tipo = normalizarNFC(tipoProducto) as TipoProducto;

    if (!TIPOS_PRODUCTO.includes(tipo)) {
      res
        .status(400)
        .json({ mensaje: 'El tipo de producto debe ser "construcción" o "general"' });
      return;
    }

    // new Date() con un texto invalido no lanza error: devuelve una fecha
    // "Invalid Date" cuyo getTime() es NaN. Por eso se chequea asi.
    const inicio = new Date(fechaHoraProgramada);

    if (Number.isNaN(inicio.getTime())) {
      res.status(400).json({ mensaje: 'fechaHoraProgramada no es una fecha válida' });
      return;
    }

    const duracion = Number(duracionEstimadaMinutos);

    if (!Number.isInteger(duracion) || duracion <= 0) {
      res
        .status(400)
        .json({ mensaje: 'duracionEstimadaMinutos debe ser un número entero mayor a 0' });
      return;
    }

    // 2. El proveedor tiene que existir. Un id con formato invalido se trata
    // igual que uno inexistente: sin este chequeo, findById lanzaria un
    // CastError y la peticion terminaria en un 500 por un error del cliente.
    // Se pide activo: true porque un proveedor dado de baja sigue en la base:
    // el borrado logico no lo borra, pero tampoco se le pueden programar
    // entregas nuevas. Para el cliente es el mismo error que si no existiera.
    const proveedorExiste =
      mongoose.isValidObjectId(proveedorId) &&
      (await Proveedor.exists({ _id: proveedorId, activo: true }));

    if (!proveedorExiste) {
      res.status(400).json({ mensaje: 'El proveedor indicado no existe o está inactivo' });
      return;
    }

    // El horario operativo, los dias de atencion y el prefijo del numero de
    // pedido salen de la coleccion parametros, no de una constante: el
    // negocio los cambia sin desplegar.
    const { horario, numeroEquipo } = await obtenerConfiguracionOperativa();

    // 3. La ventana la calcula el backend, nunca se toma del cliente.
    const ventana = calcularVentana(inicio, duracion);

    // 4a, 4b y 4c: fecha pasada, dia de atencion y horario operativo.
    if (respondioVentanaInvalida(ventana, horario, res)) {
      return;
    }

    // Auditoria: se resuelve ANTES de entrar a la cola. Es una consulta a la
    // base, y adentro de la cola demoraria el turno de las otras altas.
    const usuarioCreacion = await nombreDelUsuario(req);

    // 4d y 5. Revisar el solapamiento y guardar van juntos dentro de la cola,
    // para que otra alta no se meta entre la consulta y el guardado.
    const resultado = await ejecutarEnSerie(async (): Promise<ResultadoAlta> => {
      const alternativas = await buscarSolapamiento(ventana, duracion, horario);

      if (alternativas) {
        return { tipo: 'solape', alternativas };
      }

      // Sin choques: se guarda. El numero se genera aca adentro, despues de
      // todas las validaciones y justo antes de guardar, para que dos altas
      // simultaneas (encoladas por ejecutarEnSerie) nunca calculen el mismo
      // numero. El estado se fija aca y no se lee del body, para que el
      // cliente no pueda crear un pedido en otro estado.
      const numeroPedido = await generarNumeroPedido(numeroEquipo);

      const pedido = await Pedido.create({
        numeroPedido,
        proveedorId,
        tipoProducto: tipo,
        fechaHoraProgramada: inicio,
        duracionEstimadaMinutos: duracion,
        inicioVentana: ventana.inicio,
        finVentana: ventana.fin,
        estado: 'PROGRAMADO',
        usuarioCreacion
      });

      return { tipo: 'creado', pedido };
    });

    if (resultado.tipo === 'solape') {
      res.status(409).json({ mensaje: MENSAJE_SOLAPE, alternativas: resultado.alternativas });
      return;
    }

    // Se devuelve con el proveedor poblado, igual que en el GET,
    // para que el frontend reciba siempre la misma forma de pedido.
    await resultado.pedido.populate('proveedorId');

    res.status(201).json(resultado.pedido);
  } catch (error) {
    // El duplicado se responde 400 y no 409, igual que el chequeo previo del
    // numeroPedido: para el cliente es el mismo error de datos.
    if (
      respondioErrorDeEscritura(error, res, {
        mensajeDuplicado: MENSAJE_DUPLICADO,
        estadoDuplicado: 400
      })
    ) {
      return;
    }

    console.error('[Pedidos] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/pedidos
 *
 * Devuelve los pedidos ACTIVOS ordenados por inicio de ventana, con los datos
 * del proveedor poblados en proveedorId en lugar de solo su id. Los dados de
 * baja no salen, salvo que se pida ?incluirInactivos=true.
 */
export const listarPedidos = async (req: Request, res: Response): Promise<void> => {
  try {
    // Antes de listar se cierran los pedidos vencidos que nunca registraron
    // llegada: nadie dispara el estado AUSENTE, es la falta de un evento.
    // Ver services/controlAusencias.ts para por que se hace aca y no con un
    // proceso aparte.
    const { tolerancias } = await obtenerConfiguracionOperativa();
    await marcarPedidosAusentes(tolerancias);

    const pedidos = await Pedido.find(filtroActivos<IPedido>(req))
      .sort({ inicioVentana: 1 })
      .populate('proveedorId');
    res.status(200).json(pedidos);
  } catch (error) {
    console.error('[Pedidos] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/pedidos/:id
 *
 * Actualiza los datos administrativos de un pedido: su numero, el proveedor
 * y el tipo de producto.
 *
 * La ventana horaria NO se cambia aca, sino con /reprogramar: mover el
 * horario obliga a revalidar dia de atencion, horario operativo y
 * solapamiento, y mezclar las dos cosas en un mismo endpoint haria que un
 * cambio de telefono pudiera devolver un 409 por choque de agenda.
 */
export const actualizarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del pedido')) {
      return;
    }

    const pedido = await Pedido.findOne({ _id: id, activo: true });

    if (!pedido) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    // Sprint 3: un pedido en pleno ciclo de descarga no se edita (ver la
    // constante arriba).
    if (ESTADOS_BLOQUEADOS_EDICION.includes(pedido.estado)) {
      res.status(400).json({
        mensaje: `No se puede modificar un pedido en estado ${pedido.estado}`
      });
      return;
    }

    const { numeroPedido, proveedorId, tipoProducto } = req.body ?? {};

    // El numero de pedido se genera en el servidor (ver numeroPedido.ts) y
    // ya no se puede editar a mano. Mandar el mismo numero que ya tiene no
    // es un error (un formulario puede devolver el objeto completo), pero
    // mandar uno distinto si lo es.
    if (numeroPedido !== undefined && numeroPedido !== pedido.numeroPedido) {
      res.status(400).json({
        mensaje: 'El número de pedido se genera automáticamente y no se puede modificar'
      });
      return;
    }

    if (proveedorId !== undefined) {
      const proveedorExiste =
        mongoose.isValidObjectId(proveedorId) &&
        (await Proveedor.exists({ _id: proveedorId, activo: true }));

      if (!proveedorExiste) {
        res.status(400).json({ mensaje: 'El proveedor indicado no existe o está inactivo' });
        return;
      }

      pedido.proveedorId = proveedorId;
    }

    if (tipoProducto !== undefined) {
      const tipo = normalizarNFC(tipoProducto) as TipoProducto;

      if (!TIPOS_PRODUCTO.includes(tipo)) {
        res
          .status(400)
          .json({ mensaje: 'El tipo de producto debe ser "construcción" o "general"' });
        return;
      }

      pedido.tipoProducto = tipo;
    }

    pedido.usuarioActualizacion = await nombreDelUsuario(req);

    await pedido.save();
    await pedido.populate('proveedorId');

    res.status(200).json(pedido);
  } catch (error) {
    if (
      respondioErrorDeEscritura(error, res, {
        mensajeDuplicado: MENSAJE_DUPLICADO,
        estadoDuplicado: 400
      })
    ) {
      return;
    }

    console.error('[Pedidos] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/pedidos/:id/reprogramar
 *
 * Mueve la ventana horaria de un pedido. Recibe { fechaHoraProgramada } y,
 * opcionalmente, { duracionEstimadaMinutos }; si no viene, se conserva la
 * duracion que ya tenia.
 *
 * Revalida todo lo del alta: fecha no pasada, dia de atencion, horario
 * operativo y solapamiento (409 con alternativas), pero sin contar al propio
 * pedido como un choque.
 */
export const reprogramarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del pedido')) {
      return;
    }

    const pedido = await Pedido.findOne({ _id: id, activo: true });

    if (!pedido) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    // Un pedido cuyo camion ya llego no se reprograma: la entrega ocurrio y
    // cambiarle la ventana falsearia el historial de puntualidad. En cambio un
    // AUSENTE si se puede reprogramar: es justamente el que hay que reagendar.
    if (pedido.estado !== 'PROGRAMADO' && pedido.estado !== 'AUSENTE') {
      res.status(400).json({
        mensaje: `No se puede reprogramar un pedido en estado ${pedido.estado}`
      });
      return;
    }

    const { fechaHoraProgramada, duracionEstimadaMinutos } = req.body ?? {};

    if (
      fechaHoraProgramada === undefined ||
      fechaHoraProgramada === null ||
      String(fechaHoraProgramada).trim() === ''
    ) {
      res.status(400).json({ mensaje: 'fechaHoraProgramada es obligatoria' });
      return;
    }

    const inicio = new Date(fechaHoraProgramada);

    if (Number.isNaN(inicio.getTime())) {
      res.status(400).json({ mensaje: 'fechaHoraProgramada no es una fecha válida' });
      return;
    }

    // Si no mandan duracion, se conserva la que ya tenia el pedido.
    const duracion =
      duracionEstimadaMinutos === undefined
        ? pedido.duracionEstimadaMinutos
        : Number(duracionEstimadaMinutos);

    if (!Number.isInteger(duracion) || duracion <= 0) {
      res
        .status(400)
        .json({ mensaje: 'duracionEstimadaMinutos debe ser un número entero mayor a 0' });
      return;
    }

    const { horario } = await obtenerConfiguracionOperativa();
    const ventana = calcularVentana(inicio, duracion);

    if (respondioVentanaInvalida(ventana, horario, res)) {
      return;
    }

    const usuarioActualizacion = await nombreDelUsuario(req);

    // Misma cola que el alta: revisar el solapamiento y guardar tienen que ir
    // juntos, o dos reprogramaciones simultaneas podrian caer en la misma franja.
    const resultado = await ejecutarEnSerie(async (): Promise<ResultadoReprogramacion> => {
      const alternativas = await buscarSolapamiento(ventana, duracion, horario, pedido._id);

      if (alternativas) {
        return { tipo: 'solape', alternativas };
      }

      pedido.fechaHoraProgramada = inicio;
      pedido.duracionEstimadaMinutos = duracion;
      pedido.inicioVentana = ventana.inicio;
      pedido.finVentana = ventana.fin;
      // Reprogramar un AUSENTE es darle una cita nueva: vuelve a PROGRAMADO y
      // se borra la llegada anterior, que era la de la cita que no se cumplio.
      pedido.estado = 'PROGRAMADO';
      pedido.fechaHoraLlegadaReal = undefined;
      pedido.usuarioActualizacion = usuarioActualizacion;

      await pedido.save();

      return { tipo: 'reprogramado', pedido };
    });

    if (resultado.tipo === 'solape') {
      res.status(409).json({ mensaje: MENSAJE_SOLAPE, alternativas: resultado.alternativas });
      return;
    }

    await resultado.pedido.populate('proveedorId');

    res.status(200).json({ mensaje: 'Pedido reprogramado', pedido: resultado.pedido });
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Pedidos] Error al reprogramar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/pedidos/:id/cancelar
 *
 * Cancela un pedido: lo deja en estado CANCELADO y activo en false. La franja
 * horaria queda libre para programar otra entrega.
 *
 * Es distinto del DELETE: el DELETE solo da de baja el registro, mientras que
 * cancelar deja escrito en el estado por que ya no cuenta esa entrega.
 */
export const cancelarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del pedido')) {
      return;
    }

    const pedido = await Pedido.findOne({ _id: id, activo: true });

    if (!pedido) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    // Una entrega que ya se recibio no se cancela: si se permitiera, el
    // reporte de arribos perderia un camion que efectivamente llego.
    if (pedido.fechaHoraLlegadaReal) {
      res.status(400).json({
        mensaje: 'No se puede cancelar un pedido que ya registró llegada'
      });
      return;
    }

    pedido.estado = 'CANCELADO';
    pedido.activo = false;
    pedido.usuarioActualizacion = await nombreDelUsuario(req);

    await pedido.save();

    res.status(200).json({ mensaje: 'Pedido cancelado', pedido });
  } catch (error) {
    console.error('[Pedidos] Error al cancelar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/pedidos/:id
 *
 * Borrado logico: pasa activo a false y conserva el estado. El documento no se
 * borra de la base, asi el historial y la auditoria siguen completos.
 */
export const inactivarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del pedido')) {
      return;
    }

    const pedido = await Pedido.findOne({ _id: id, activo: true });

    // Si ya estaba inactivo se responde igual que si no existiera: para el
    // cliente el resultado es el mismo y no hay nada que dar de baja.
    if (!pedido) {
      res.status(404).json({ mensaje: 'El pedido indicado no existe o ya está inactivo' });
      return;
    }

    // Sprint 3: inactivar un pedido DESCARGANDO dejaria su gateway OCUPADO
    // para siempre, sin manera de finalizar esa descarga.
    if (ESTADOS_BLOQUEADOS_EDICION.includes(pedido.estado)) {
      res.status(400).json({
        mensaje: `No se puede inactivar un pedido en estado ${pedido.estado}`
      });
      return;
    }

    pedido.activo = false;
    pedido.usuarioActualizacion = await nombreDelUsuario(req);

    await pedido.save();

    res.status(200).json({ mensaje: 'Pedido inactivado', pedido });
  } catch (error) {
    console.error('[Pedidos] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
