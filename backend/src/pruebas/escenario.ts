import { Types } from 'mongoose';
import Pedido, { EstadoPedido, IPedido, TipoProducto } from '../models/Pedido';
import Proveedor, { IProveedor } from '../models/Proveedor';
import Gateway, { EstadoGateway, IGateway, tipoCargaEsperado } from '../models/Gateway';
import Descarga from '../models/Descarga';
import { PREFIJO_QA } from './entorno';

/**
 * Preparación y limpieza del estado para cada caso de prueba.
 *
 * Cada caso arma el escenario que necesita y lo deja como lo encontró. Los
 * documentos que crea el banco llevan el prefijo QA- en el número de pedido y
 * en la identificación del proveedor, de modo que la limpieza no pueda tocar
 * datos reales del equipo aunque se corra contra la base de desarrollo.
 */

const MS_POR_MINUTO = 60 * 1000;

let contador = 0;

/** Número de pedido único para el banco de pruebas. */
const numeroDePrueba = (): string => {
  contador += 1;
  return `${PREFIJO_QA}${Date.now()}-${String(contador).padStart(3, '0')}`;
};

/** Fecha desplazada en minutos respecto de ahora. Negativo = en el pasado. */
export const enMinutos = (minutos: number): Date => new Date(Date.now() + minutos * MS_POR_MINUTO);

// ---------------------------------------------------------------- proveedor
export const crearProveedorDePrueba = async (
  categoria: TipoProducto
): Promise<IProveedor> =>
  Proveedor.create({
    razonSocial: `${PREFIJO_QA}Proveedor ${categoria} ${contador}`,
    identificacionTributaria: `${PREFIJO_QA}${Date.now()}${contador}`,
    categoria,
    contactoNombre: 'Contacto de prueba',
    telefono: '0000-0000',
    emailContacto: `qa${Date.now()}${contador}@prueba.local`,
    usuarioCreacion: 'Banco de pruebas QA'
  });

// ------------------------------------------------------------------- pedido
export interface OpcionesPedido {
  /** Minutos desde ahora hasta el inicio de la ventana. Negativo = ya pasó. */
  inicioEnMinutos: number;
  tipoProducto: TipoProducto;
  duracionMinutos?: number;
  estado?: EstadoPedido;
  /** Minutos desde ahora de la llegada real. Si se omite, no registró llegada. */
  llegadaEnMinutos?: number;
  proveedorId?: Types.ObjectId;
}

/**
 * Crea un pedido directamente en la base, con la ventana que pida el caso.
 *
 * Se escribe con create() y no por POST /api/pedidos porque varios casos
 * necesitan una ventana que ya venció, y el endpoint rechaza las fechas
 * pasadas (RN-01). Montar el escenario por la base deja intacta esa
 * validación para los casos que sí la verifican (CP-11).
 */
export const crearPedidoDePrueba = async (opciones: OpcionesPedido): Promise<IPedido> => {
  const {
    inicioEnMinutos,
    tipoProducto,
    duracionMinutos = 60,
    estado = 'PROGRAMADO',
    llegadaEnMinutos,
    proveedorId
  } = opciones;

  const proveedor = proveedorId ?? (await crearProveedorDePrueba(tipoProducto))._id;
  const inicio = enMinutos(inicioEnMinutos);

  return Pedido.create({
    numeroPedido: numeroDePrueba(),
    proveedorId: proveedor,
    tipoProducto,
    fechaHoraProgramada: inicio,
    duracionEstimadaMinutos: duracionMinutos,
    inicioVentana: inicio,
    finVentana: new Date(inicio.getTime() + duracionMinutos * MS_POR_MINUTO),
    estado,
    fechaHoraLlegadaReal:
      llegadaEnMinutos === undefined ? undefined : enMinutos(llegadaEnMinutos),
    usuarioCreacion: 'Banco de pruebas QA'
  });
};

export const leerPedido = async (id: Types.ObjectId | string): Promise<IPedido | null> =>
  Pedido.findById(id);

// ------------------------------------------------------------------ gateway
export const leerGatewayPorNumero = async (numero: number): Promise<IGateway> => {
  const gateway = await Gateway.findOne({ numeroGateway: numero });

  if (!gateway) {
    throw new Error(
      `No existe el gateway ${numero} en la base. Ejecute "npm run seed:gateways" antes de correr las pruebas.`
    );
  }

  return gateway;
};

/** Fuerza el estado de una bahía para montar el escenario del caso. */
export const ponerGatewayEn = async (numero: number, estado: EstadoGateway): Promise<IGateway> => {
  const gateway = await leerGatewayPorNumero(numero);
  gateway.estado = estado;
  await gateway.save();
  return gateway;
};

/** Devuelve las cinco bahías a LIBRE y cierra las descargas del banco. */
export const restaurarGateways = async (): Promise<void> => {
  await Gateway.updateMany({}, { estado: 'LIBRE' });
};

// ------------------------------------------------------------------ limpieza
/**
 * Borra todo lo que creó el banco de pruebas.
 *
 * Aquí sí se usa deleteMany y no el borrado lógico del proyecto: estos
 * documentos no son historial del negocio, son andamiaje de la prueba, y
 * dejarlos marcados como inactivos ensuciaría los indicadores.
 */
export const limpiarDatosDePrueba = async (): Promise<void> => {
  // Los proveedores del banco se identifican por el prefijo; sus pedidos, no
  // siempre. CP-11 y CP-12 crean pedidos por POST /api/pedidos, y el servidor
  // les asigna un correlativo real (PED-EQUIxx-...), no el prefijo QA-.
  // Buscar solo por numeroPedido dejaba esos pedidos vivos, ocupando la franja
  // horaria y haciendo fallar la corrida siguiente con un 409 legitimo.
  // Por eso se borra tambien todo pedido que apunte a un proveedor del banco.
  const proveedores = await Proveedor.find({
    identificacionTributaria: { $regex: `^${PREFIJO_QA}` }
  }).select('_id');
  const idsProveedores = proveedores.map((p) => p._id);

  const pedidos = await Pedido.find({
    $or: [
      { numeroPedido: { $regex: `^${PREFIJO_QA}` } },
      { proveedorId: { $in: idsProveedores } }
    ]
  }).select('_id');
  const ids = pedidos.map((p) => p._id);

  if (ids.length > 0) {
    await Descarga.deleteMany({ pedidoId: { $in: ids } });
    await Pedido.deleteMany({ _id: { $in: ids } });
  }

  // Los proveedores se borran despues que sus pedidos: al reves quedarian
  // pedidos huerfanos, que es justamente el problema que esto corrige.
  if (idsProveedores.length > 0) {
    await Proveedor.deleteMany({ _id: { $in: idsProveedores } });
  }

  await restaurarGateways();
};

/**
 * Borra pedidos que quedaron apuntando a un proveedor inexistente.
 *
 * Son residuos de corridas anteriores a la correccion de limpiarDatosDePrueba:
 * el proveedor del banco se borro y su pedido quedo vivo. No puede tocar datos
 * reales porque el proyecto nunca borra un proveedor fisicamente: lo marca
 * inactivo (ver models/auditoria.ts), asi que un pedido del negocio siempre
 * resuelve su proveedor.
 */
export const limpiarPedidosHuerfanos = async (): Promise<number> => {
  const pedidos = await Pedido.find().select('_id proveedorId');
  const huerfanos: Types.ObjectId[] = [];

  for (const pedido of pedidos) {
    const existe = await Proveedor.exists({ _id: pedido.proveedorId });
    if (!existe) huerfanos.push(pedido._id as Types.ObjectId);
  }

  if (huerfanos.length > 0) {
    await Descarga.deleteMany({ pedidoId: { $in: huerfanos } });
    await Pedido.deleteMany({ _id: { $in: huerfanos } });
  }

  return huerfanos.length;
};

/** Comprueba que el seed de bahías esté aplicado antes de empezar. */
export const verificarBahiasSembradas = async (): Promise<void> => {
  for (let numero = 1; numero <= 5; numero++) {
    const gateway = await leerGatewayPorNumero(numero);
    const esperado = tipoCargaEsperado(numero);

    if (gateway.tipoCargaPermitida !== esperado) {
      throw new Error(
        `El gateway ${numero} tiene tipo de carga "${gateway.tipoCargaPermitida}" ` +
          `cuando debería ser "${esperado}". Ejecute "npm run seed:gateways".`
      );
    }
  }
};
