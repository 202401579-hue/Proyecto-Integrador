import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Pedido, { IPedido, TIPOS_PRODUCTO, TipoProducto } from '../models/Pedido';
import Proveedor, { normalizarNFC } from '../models/Proveedor';
import {
  HORARIO_OPERATIVO,
  VentanaHoraria,
  buscarAlternativas,
  calcularVentana,
  estaDentroDelHorario,
  limitesDelDia,
  seSolapan
} from '../services/ventanaHoraria';

// Cantidad de ventanas libres que se ofrecen cuando hay solapamiento,
// y hasta cuantos dias hacia adelante se buscan.
const CANTIDAD_ALTERNATIVAS = 3;
const DIAS_BUSQUEDA_ALTERNATIVAS = 7;

const dosDigitos = (n: number): string => String(n).padStart(2, '0');
const TEXTO_HORARIO = `${dosDigitos(HORARIO_OPERATIVO.horaApertura)}:00 a ${dosDigitos(
  HORARIO_OPERATIVO.horaCierre
)}:00`;

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

type ResultadoAlta =
  | { tipo: 'solape'; alternativas: { inicioVentana: Date; finVentana: Date }[] }
  | { tipo: 'creado'; pedido: IPedido };

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
 *      horario operativo                                -> 400
 *      solapamiento con los pedidos programados del dia -> 409 + alternativas
 *   5. guardar                                          -> 201
 */
export const crearPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      numeroPedido,
      proveedorId,
      tipoProducto,
      fechaHoraProgramada,
      duracionEstimadaMinutos
    } = req.body ?? {};

    // 1. Campos obligatorios. Se compara contra undefined/null/'' y no con !valor,
    // porque !0 es true y una duracion 0 tiene que caer en el mensaje de formato.
    const faltaCampo = [
      numeroPedido,
      proveedorId,
      tipoProducto,
      fechaHoraProgramada,
      duracionEstimadaMinutos
    ].some((valor) => valor === undefined || valor === null || String(valor).trim() === '');

    if (faltaCampo) {
      res.status(400).json({
        mensaje:
          'numeroPedido, proveedorId, tipoProducto, fechaHoraProgramada y duracionEstimadaMinutos son obligatorios'
      });
      return;
    }

    // Es un codigo que escribe el coordinador: se exige texto para que un
    // objeto o un arreglo no terminen guardados como "[object Object]".
    if (typeof numeroPedido !== 'string') {
      res.status(400).json({ mensaje: 'numeroPedido debe ser un texto' });
      return;
    }

    const numero = numeroPedido.trim();

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
    const proveedorExiste =
      mongoose.isValidObjectId(proveedorId) && (await Proveedor.exists({ _id: proveedorId }));

    if (!proveedorExiste) {
      res.status(400).json({ mensaje: 'El proveedor indicado no existe' });
      return;
    }

    // El numero de pedido es el codigo de la orden de compra: no se puede
    // repetir. El indice unico del modelo es la garantia final (ver el catch);
    // este chequeo previo permite responder antes de calcular la ventana.
    if (await Pedido.exists({ numeroPedido: numero })) {
      res.status(400).json({ mensaje: `Ya existe un pedido con el número ${numero}` });
      return;
    }

    // 3. La ventana la calcula el backend, nunca se toma del cliente.
    const ventana = calcularVentana(inicio, duracion);

    // 4a. No se programan pedidos en el pasado: nadie puede recibir
    // una entrega en un horario que ya transcurrio.
    if (ventana.inicio < new Date()) {
      res.status(400).json({ mensaje: 'No se puede programar un pedido en una fecha pasada' });
      return;
    }

    // 4b. La ventana completa tiene que entrar en el horario operativo.
    if (!estaDentroDelHorario(ventana)) {
      res.status(400).json({
        mensaje: `El pedido debe programarse dentro del horario operativo (${TEXTO_HORARIO})`
      });
      return;
    }

    // 4c y 5. Revisar el solapamiento y guardar van juntos dentro de la cola,
    // para que otra alta no se meta entre la consulta y el guardado.
    const resultado = await ejecutarEnSerie(async (): Promise<ResultadoAlta> => {
      // Se traen de una vez los pedidos programados desde el dia pedido hasta el
      // ultimo dia en que se buscarian alternativas. Los del mismo dia se usan
      // para detectar el solape; el resto, solo si hace falta ofrecer alternativas.
      const { inicio: aperturaDelDia } = limitesDelDia(ventana.inicio);
      const finBusqueda = new Date(aperturaDelDia.getTime());
      finBusqueda.setDate(finBusqueda.getDate() + DIAS_BUSQUEDA_ALTERNATIVAS + 1);

      const pedidosProgramados = await Pedido.find({
        estado: 'PROGRAMADO',
        inicioVentana: { $lt: finBusqueda },
        finVentana: { $gt: aperturaDelDia }
      }).select('inicioVentana finVentana');

      const ocupadas: VentanaHoraria[] = pedidosProgramados.map((pedido) => ({
        inicio: pedido.inicioVentana,
        fin: pedido.finVentana
      }));

      if (ocupadas.some((ocupada) => seSolapan(ventana, ocupada))) {
        // Las alternativas arrancan en la hora pedida o en este momento,
        // lo que sea mas tarde, para no ofrecer horarios que ya pasaron.
        const ahora = new Date();
        const desde = ventana.inicio > ahora ? ventana.inicio : ahora;

        const alternativas = buscarAlternativas(
          desde,
          duracion,
          ocupadas,
          CANTIDAD_ALTERNATIVAS,
          DIAS_BUSQUEDA_ALTERNATIVAS
        ).map((alternativa) => ({
          inicioVentana: alternativa.inicio,
          finVentana: alternativa.fin
        }));

        return { tipo: 'solape', alternativas };
      }

      // Sin choques: se guarda. El estado se fija aca y no se lee del body,
      // para que el cliente no pueda crear un pedido en otro estado.
      const pedido = await Pedido.create({
        numeroPedido: numero,
        proveedorId,
        tipoProducto: tipo,
        fechaHoraProgramada: inicio,
        duracionEstimadaMinutos: duracion,
        inicioVentana: ventana.inicio,
        finVentana: ventana.fin,
        estado: 'PROGRAMADO'
      });

      return { tipo: 'creado', pedido };
    });

    if (resultado.tipo === 'solape') {
      res.status(409).json({
        mensaje: 'La ventana horaria se solapa con otro pedido ya programado',
        alternativas: resultado.alternativas
      });
      return;
    }

    // Se devuelve con el proveedor poblado, igual que en el GET,
    // para que el frontend reciba siempre la misma forma de pedido.
    await resultado.pedido.populate('proveedorId');

    res.status(201).json(resultado.pedido);
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const primerError = Object.values(error.errors)[0];
      // Un CastError (por ejemplo, un objeto donde va texto) trae un mensaje
      // interno de Mongoose en ingles: se reemplaza por uno para el usuario.
      const mensaje =
        primerError instanceof mongoose.Error.CastError
          ? `El campo ${primerError.path} tiene un formato inválido`
          : primerError.message;
      res.status(400).json({ mensaje });
      return;
    }

    // 11000 es el codigo de MongoDB para una clave unica duplicada. Llega aca
    // si el numeroPedido se repite y el chequeo previo no lo vio (por ejemplo,
    // un alta simultanea con el mismo numero). Mismo 400 que el chequeo previo.
    if ((error as { code?: number }).code === 11000) {
      res.status(400).json({ mensaje: 'Ya existe un pedido con ese número de pedido' });
      return;
    }

    console.error('[Pedidos] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/pedidos
 *
 * Devuelve todos los pedidos ordenados por inicio de ventana, con los datos
 * del proveedor poblados en proveedorId en lugar de solo su id.
 */
export const listarPedidos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const pedidos = await Pedido.find().sort({ inicioVentana: 1 }).populate('proveedorId');
    res.status(200).json(pedidos);
  } catch (error) {
    console.error('[Pedidos] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
