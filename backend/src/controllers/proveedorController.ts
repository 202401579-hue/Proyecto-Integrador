import { Request, Response } from 'express';
import Proveedor, { IProveedor } from '../models/Proveedor';
import Pedido, { ESTADOS_QUE_OCUPAN_FRANJA } from '../models/Pedido';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { filtroActivos } from '../services/borradoLogico';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';

const MENSAJE_DUPLICADO = 'Ya existe un proveedor con esa identificación tributaria';
const MENSAJE_NO_ENCONTRADO = 'El proveedor indicado no existe o está inactivo';

/**
 * POST /api/proveedores
 *
 * Recibe { razonSocial, identificacionTributaria, categoria, contactoNombre,
 * telefono, emailContacto } y devuelve el proveedor creado (201).
 */
export const crearProveedor = async (req: Request, res: Response): Promise<void> => {
  try {
    // Mismo resguardo que en el login: sin Content-Type JSON, req.body es undefined.
    const {
      razonSocial,
      identificacionTributaria,
      categoria,
      contactoNombre,
      telefono,
      emailContacto
    } = req.body ?? {};

    // Se arma el objeto campo por campo para que un cliente no pueda
    // colar propiedades extra (por ejemplo _id, activo o fechaCreacion).
    const proveedor = await Proveedor.create({
      razonSocial,
      identificacionTributaria,
      categoria,
      contactoNombre,
      telefono,
      emailContacto,
      // Auditoria: quien dio el alta. El nombre sale de la base, no del
      // token, porque el token solo trae id, correo y rol.
      usuarioCreacion: await nombreDelUsuario(req)
    });

    res.status(201).json(proveedor);
  } catch (error) {
    // Campos faltantes, categoria fuera del enum, email mal formado o
    // identificacion repetida: son errores del cliente y los traduce el
    // servicio compartido (ver services/respuestasError.ts).
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Proveedores] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/proveedores
 *
 * Devuelve los proveedores ACTIVOS, ordenados por razon social. Los dados
 * de baja no salen, salvo que se pida ?incluirInactivos=true.
 */
export const listarProveedores = async (req: Request, res: Response): Promise<void> => {
  try {
    const proveedores = await Proveedor.find(filtroActivos<IProveedor>(req)).sort({
      razonSocial: 1
    });
    res.status(200).json(proveedores);
  } catch (error) {
    console.error('[Proveedores] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/proveedores/:id
 *
 * Actualiza los datos de un proveedor activo y deja registrado quien lo
 * modifico. Solo se tocan los campos que vinieron en el body.
 *
 * Se busca el documento y se guarda con save() en lugar de usar
 * findByIdAndUpdate: asi corren las validaciones del esquema (enum de
 * categoria, formato del email) igual que en un alta.
 */
export const actualizarProveedor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del proveedor')) {
      return;
    }

    // Se exige activo: true. Un proveedor dado de baja no se edita: primero
    // habria que reactivarlo, y eso es una decision explicita.
    const proveedor = await Proveedor.findOne({ _id: id, activo: true });

    if (!proveedor) {
      res.status(404).json({ mensaje: MENSAJE_NO_ENCONTRADO });
      return;
    }

    const {
      razonSocial,
      identificacionTributaria,
      categoria,
      contactoNombre,
      telefono,
      emailContacto
    } = req.body ?? {};

    // Campo por campo, y solo los editables: ni activo ni los campos de
    // auditoria se leen del cliente. El borrado logico tiene su propio
    // endpoint y las fechas las maneja Mongoose.
    if (razonSocial !== undefined) {
      proveedor.razonSocial = razonSocial;
    }

    if (identificacionTributaria !== undefined) {
      proveedor.identificacionTributaria = identificacionTributaria;
    }

    if (categoria !== undefined) {
      proveedor.categoria = categoria;
    }

    if (contactoNombre !== undefined) {
      proveedor.contactoNombre = contactoNombre;
    }

    if (telefono !== undefined) {
      proveedor.telefono = telefono;
    }

    if (emailContacto !== undefined) {
      proveedor.emailContacto = emailContacto;
    }

    proveedor.usuarioActualizacion = await nombreDelUsuario(req);

    await proveedor.save();

    res.status(200).json(proveedor);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Proveedores] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/proveedores/:id
 *
 * Borrado logico: pasa activo a false. El documento no se borra de la base,
 * asi los pedidos que lo referencian siguen resolviendo el populate y la
 * auditoria queda completa.
 */
export const inactivarProveedor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del proveedor')) {
      return;
    }

    const proveedor = await Proveedor.findOne({ _id: id, activo: true });

    // Si ya estaba inactivo se responde igual que si no existiera: para el
    // cliente el resultado es el mismo y no hay nada que dar de baja.
    if (!proveedor) {
      res
        .status(404)
        .json({ mensaje: 'El proveedor indicado no existe o ya está inactivo' });
      return;
    }

    // Dar de baja al proveedor no cancela sus entregas ya programadas: son dos
    // decisiones distintas y cancelar pedidos por detras seria una sorpresa.
    // Pero dejarlo callado tambien: se cuentan y se avisan en la respuesta,
    // para que el coordinador sepa que le quedan pedidos por reprogramar.
    const pedidosPendientes = await Pedido.countDocuments({
      proveedorId: proveedor._id,
      activo: true,
      estado: { $in: ESTADOS_QUE_OCUPAN_FRANJA },
      inicioVentana: { $gte: new Date() }
    });

    proveedor.activo = false;
    proveedor.usuarioActualizacion = await nombreDelUsuario(req);

    await proveedor.save();

    const respuesta: Record<string, unknown> = {
      mensaje: 'Proveedor inactivado',
      proveedor
    };

    if (pedidosPendientes > 0) {
      respuesta.advertencia =
        `El proveedor tiene ${pedidosPendientes} pedido(s) programado(s) a futuro. ` +
        'Conviene cancelarlos o reprogramarlos con otro proveedor.';
    }

    res.status(200).json(respuesta);
  } catch (error) {
    console.error('[Proveedores] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
