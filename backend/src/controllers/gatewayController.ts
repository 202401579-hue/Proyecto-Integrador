import { Request, Response } from 'express';
import Gateway, {
  ESTADOS_GATEWAY,
  EstadoGateway,
  IGateway,
  NUMERO_GATEWAY_MAXIMO,
  NUMERO_GATEWAY_MINIMO,
  TIPOS_CARGA,
  TipoCarga,
  tipoCargaEsperado
} from '../models/Gateway';
import { normalizarNFC } from '../models/Proveedor';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { filtroActivos } from '../services/borradoLogico';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';
import { registrarEvento } from '../services/eventos';

const MENSAJE_DUPLICADO = 'Ya existe un gateway con ese número';
const MENSAJE_NO_ENCONTRADO = 'El gateway indicado no existe o está inactivo';
const MENSAJE_NUMERO =
  `El número de gateway debe ser un número entero entre ${NUMERO_GATEWAY_MINIMO} y ${NUMERO_GATEWAY_MAXIMO}`;
const MENSAJE_TIPO_CARGA = 'El tipo de carga permitida debe ser "construcción" o "general"';

/**
 * Estados que el Administrador puede fijar desde la API.
 *
 * OCUPADO queda afuera a proposito: lo asigna y lo quita el registro de
 * descargas. Si se pudiera editar a mano, un administrador podria liberar
 * una bahia en plena descarga y el sistema la ofreceria como disponible
 * mientras un camion sigue ahi.
 */
// El tipo se declara como la lista completa a proposito: filter() deduciria
// un tipo sin OCUPADO y entonces includes() no aceptaria comparar contra el
// estado que mando el cliente, que si puede ser OCUPADO.
const ESTADOS_EDITABLES: readonly EstadoGateway[] = ESTADOS_GATEWAY.filter(
  (estado) => estado !== 'OCUPADO'
);

const MENSAJE_ESTADO = `El estado debe ser ${ESTADOS_EDITABLES.map((e) => `"${e}"`).join(' o ')}`;

/**
 * RN-07 y RN-08: cada bahia tiene su tipo de carga segun su numero.
 * Devuelve true si ya respondio.
 */
const respondioCargaIncompatible = (
  numeroGateway: number,
  tipoCargaPermitida: TipoCarga,
  res: Response
): boolean => {
  const esperado = tipoCargaEsperado(numeroGateway);

  if (tipoCargaPermitida === esperado) {
    return false;
  }

  res
    .status(400)
    .json({ mensaje: `El gateway ${numeroGateway} solo admite carga "${esperado}"` });
  return true;
};

/**
 * GET /api/gateways
 *
 * Devuelve las bahias ACTIVAS ordenadas por numero. Las dadas de baja no
 * salen, salvo que se pida ?incluirInactivos=true.
 */
export const listarGateways = async (req: Request, res: Response): Promise<void> => {
  try {
    const gateways = await Gateway.find(filtroActivos<IGateway>(req)).sort({ numeroGateway: 1 });
    res.status(200).json(gateways);
  } catch (error) {
    console.error('[Gateways] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/gateways/:id
 *
 * Devuelve una bahia activa. Una dada de baja responde 404, salvo que se
 * pida ?incluirInactivos=true: el mismo criterio que el listado.
 */
export const obtenerGateway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del gateway')) {
      return;
    }

    const gateway = await Gateway.findOne({ _id: id, ...filtroActivos<IGateway>(req) });

    if (!gateway) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    res.status(200).json(gateway);
  } catch (error) {
    console.error('[Gateways] Error al obtener:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * POST /api/gateways
 *
 * Recibe { numeroGateway, tipoCargaPermitida, estado? } y devuelve la bahia
 * creada (201).
 *
 * Las bahias son cinco y las carga el seed, asi que este endpoint es mas
 * para reponer una que para usarlo todos los dias. Valida igual todo:
 * rango del numero, lista cerrada del tipo de carga, RN-07 y RN-08, y que
 * el numero no este repetido.
 */
export const crearGateway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { numeroGateway, tipoCargaPermitida, estado } = req.body ?? {};

    // 1. El numero: entero y dentro del rango de bahias que existen.
    const numero = Number(numeroGateway);

    if (
      numeroGateway === undefined ||
      numeroGateway === null ||
      !Number.isInteger(numero) ||
      numero < NUMERO_GATEWAY_MINIMO ||
      numero > NUMERO_GATEWAY_MAXIMO
    ) {
      res.status(400).json({ mensaje: MENSAJE_NUMERO });
      return;
    }

    // 2. El tipo de carga: lista cerrada. Se normaliza la tilde antes de
    // comparar (ver normalizarNFC en el modelo Proveedor).
    const tipo = normalizarNFC(tipoCargaPermitida) as TipoCarga;

    if (!TIPOS_CARGA.includes(tipo)) {
      res.status(400).json({ mensaje: MENSAJE_TIPO_CARGA });
      return;
    }

    // 3. RN-07 y RN-08.
    if (respondioCargaIncompatible(numero, tipo, res)) {
      return;
    }

    // 4. El estado es opcional; si viene, no puede ser OCUPADO.
    let estadoInicial: EstadoGateway = 'LIBRE';

    if (estado !== undefined) {
      const estadoPedido = normalizarNFC(estado) as EstadoGateway;

      if (!ESTADOS_EDITABLES.includes(estadoPedido)) {
        res.status(400).json({ mensaje: MENSAJE_ESTADO });
        return;
      }

      estadoInicial = estadoPedido;
    }

    // 5. El numero no se puede repetir: es la bahia fisica. El indice unico
    // del modelo es la garantia final (ver el catch); este chequeo previo
    // permite responder con un mensaje propio.
    if (await Gateway.exists({ numeroGateway: numero })) {
      res.status(409).json({ mensaje: MENSAJE_DUPLICADO });
      return;
    }

    // Se arma el objeto campo por campo para que un cliente no pueda colar
    // propiedades extra (por ejemplo activo o fechaCreacion) en el documento.
    const gateway = await Gateway.create({
      numeroGateway: numero,
      tipoCargaPermitida: tipo,
      estado: estadoInicial,
      usuarioCreacion: await nombreDelUsuario(req)
    });

    res.status(201).json(gateway);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Gateways] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/gateways/:id
 *
 * Actualiza el estado y/o el tipo de carga de una bahia activa.
 *
 * Lo primero que se hace es leer la bahia, porque todas las reglas dependen
 * de su estado ACTUAL y no de lo que venga en el body:
 *
 *   RN-GW-01  si esta OCUPADO, no puede pasar a FUERA DE SERVICIO.
 *   RN-GW-02  si esta OCUPADO, no se le puede cambiar el tipo de carga.
 *   Regla extra  el PUT nunca pone OCUPADO ni cambia el estado de una
 *                bahia OCUPADA: eso es del registro de descargas.
 *   RN-07/08  el tipo de carga tiene que corresponder al numero de bahia.
 *
 * numeroGateway no se edita: es el numero pintado en el piso del deposito.
 */
export const actualizarGateway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del gateway')) {
      return;
    }

    // Se exige activo: true. Una bahia dada de baja no se edita: primero
    // habria que reactivarla, y eso es una decision explicita.
    const gateway = await Gateway.findOne({ _id: id, activo: true });

    if (!gateway) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    const { numeroGateway, tipoCargaPermitida, estado } = req.body ?? {};

    // El numero es la identidad fisica de la bahia. Se rechaza solo si viene
    // distinto: mandar el mismo numero que ya tiene no cambia nada, y asi un
    // formulario puede devolver el objeto completo sin recibir un error.
    if (numeroGateway !== undefined && Number(numeroGateway) !== gateway.numeroGateway) {
      res.status(400).json({
        mensaje: 'El número de gateway no se puede modificar: es la identidad física de la bahía'
      });
      return;
    }

    const estaOcupado = gateway.estado === 'OCUPADO';
    // Se guarda antes de modificar el documento: despues del save ya no hay
    // de donde leer el estado anterior.
    const estadoAnterior = gateway.estado;

    // --- Estado ---
    if (estado !== undefined) {
      const estadoPedido = normalizarNFC(estado) as EstadoGateway;

      // RN-GW-01 primero, porque es el caso con el mensaje mas util: explica
      // que hay una descarga en curso y que hay que finalizarla.
      if (estaOcupado && estadoPedido === 'FUERA DE SERVICIO') {
        res.status(400).json({
          mensaje:
            'El gateway está OCUPADO: finalice la descarga en curso antes de ponerlo FUERA DE SERVICIO'
        });
        return;
      }

      // Una bahia ocupada no cambia de estado por la edicion. Si no, se
      // podria marcar como LIBRE con un camion descargando y el sistema la
      // ofreceria para otra entrega.
      if (estaOcupado && estadoPedido !== gateway.estado) {
        res.status(400).json({
          mensaje:
            'No se puede cambiar el estado de un gateway OCUPADO: finalice la descarga en curso'
        });
        return;
      }

      // Y nunca se pone en OCUPADO desde aca, ni siquiera si ya lo estaba.
      if (estadoPedido === 'OCUPADO') {
        res.status(400).json({
          mensaje: 'El estado OCUPADO lo asigna el registro de descargas, no la edición del gateway'
        });
        return;
      }

      if (!ESTADOS_EDITABLES.includes(estadoPedido)) {
        res.status(400).json({ mensaje: MENSAJE_ESTADO });
        return;
      }

      gateway.estado = estadoPedido;
    }

    // --- Tipo de carga ---
    if (tipoCargaPermitida !== undefined) {
      const tipo = normalizarNFC(tipoCargaPermitida) as TipoCarga;

      // RN-GW-02. Se revisa antes de la lista cerrada y de RN-07/08 para que
      // el mensaje hable del problema real: la bahia esta ocupada.
      if (estaOcupado && tipo !== gateway.tipoCargaPermitida) {
        res.status(400).json({
          mensaje:
            'No se puede cambiar el tipo de carga de un gateway OCUPADO: finalice la descarga en curso'
        });
        return;
      }

      if (!TIPOS_CARGA.includes(tipo)) {
        res.status(400).json({ mensaje: MENSAJE_TIPO_CARGA });
        return;
      }

      // RN-07 y RN-08, contra el numero que la bahia ya tiene.
      if (respondioCargaIncompatible(gateway.numeroGateway, tipo, res)) {
        return;
      }

      gateway.tipoCargaPermitida = tipo;
    }

    // activo no se lee del body: el borrado logico tiene su propio endpoint.
    gateway.usuarioActualizacion = await nombreDelUsuario(req);

    await gateway.save();

    // Solo se registra si el estado cambio de verdad. Una edicion que ajusta
    // otra cosa, o que manda el mismo estado que ya tenia, no es un evento de
    // mantenimiento: llenaria la bitacora de lineas que no cuentan nada.
    //
    // Por como esta validado arriba, aca el cambio solo puede ser entre LIBRE
    // y FUERA DE SERVICIO: OCUPADO no se asigna por edicion, y una bahia
    // OCUPADA no acepta cambios de estado.
    if (gateway.estado !== estadoAnterior) {
      await registrarEvento(req, 'GATEWAY_MANTENIMIENTO', {
        detalles: {
          numeroGateway: gateway.numeroGateway,
          estadoAnterior,
          estadoNuevo: gateway.estado
        }
      });
    }

    res.status(200).json(gateway);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Gateways] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/gateways/:id
 *
 * Borrado logico: pasa activo a false. Nunca se borra el documento, porque
 * las descargas historicas referencian la bahia y quedarian apuntando a la
 * nada.
 *
 * Solo se puede dar de baja una bahia LIBRE o FUERA DE SERVICIO: si esta
 * OCUPADO hay un camion descargando ahi.
 */
export const inactivarGateway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del gateway')) {
      return;
    }

    const gateway = await Gateway.findOne({ _id: id, activo: true });

    // Si ya estaba inactivo se responde igual que si no existiera: para el
    // cliente el resultado es el mismo y no hay nada que dar de baja.
    if (!gateway) {
      res.status(404).json({ mensaje: 'El gateway indicado no existe o ya está inactivo' });
      return;
    }

    if (gateway.estado === 'OCUPADO') {
      res.status(400).json({
        mensaje: 'No se puede dar de baja un gateway OCUPADO: finalice la descarga en curso'
      });
      return;
    }

    const estadoAnterior = gateway.estado;

    gateway.activo = false;
    gateway.usuarioActualizacion = await nombreDelUsuario(req);

    await gateway.save();

    // La baja tambien es mantenimiento: la bahia sale de operacion. Su estado
    // no cambia (sigue como estaba, LIBRE o FUERA DE SERVICIO), asi que el
    // evento lo deja claro con baja: true en lugar de inventar un estado
    // nuevo que el documento no tiene.
    await registrarEvento(req, 'GATEWAY_MANTENIMIENTO', {
      detalles: {
        numeroGateway: gateway.numeroGateway,
        estadoAnterior,
        estadoNuevo: gateway.estado,
        baja: true
      }
    });

    res.status(200).json({ mensaje: 'Gateway inactivado', gateway });
  } catch (error) {
    console.error('[Gateways] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
