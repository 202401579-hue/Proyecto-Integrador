import { Request, Response } from 'express';
import Parametro, { IParametro } from '../models/Parametro';
import { nombreDelUsuario } from '../services/usuarioAuditoria';
import { filtroActivos } from '../services/borradoLogico';
import { respondioErrorDeEscritura, respondioIdInvalido } from '../services/respuestasError';
import { invalidarConfiguracionOperativa } from '../services/configuracionOperativa';

const MENSAJE_DUPLICADO = 'Ya existe un parámetro con esa clave';

/**
 * POST /api/parametros
 *
 * Recibe { clave, valor, descripcion } y devuelve el parametro creado (201).
 */
export const crearParametro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clave, valor, descripcion } = req.body ?? {};

    // Se arma el objeto campo por campo para que un cliente no pueda colar
    // propiedades extra (por ejemplo activo o fechaCreacion) en el documento.
    const parametro = await Parametro.create({
      clave,
      valor,
      descripcion,
      usuarioCreacion: await nombreDelUsuario(req)
    });

    // El horario y las tolerancias se cachean unos segundos: al escribir un
    // parametro se borra el cache para que el cambio se aplique en el acto.
    invalidarConfiguracionOperativa();

    res.status(201).json(parametro);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Parametros] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/parametros
 *
 * Devuelve los parametros ACTIVOS ordenados por clave. Los dados de baja
 * no salen, salvo que se pida ?incluirInactivos=true.
 */
export const listarParametros = async (req: Request, res: Response): Promise<void> => {
  try {
    const parametros = await Parametro.find(filtroActivos<IParametro>(req)).sort({ clave: 1 });
    res.status(200).json(parametros);
  } catch (error) {
    console.error('[Parametros] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/parametros/:id
 *
 * Actualiza clave, valor y/o descripcion de un parametro activo y deja
 * registrado quien lo modifico.
 *
 * Se busca el documento y se guarda con save() en lugar de usar
 * findByIdAndUpdate: asi corren las validaciones del esquema y los
 * timestamps igual que en un alta.
 */
export const actualizarParametro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del parámetro')) {
      return;
    }

    // Se exige activo: true. Un parametro dado de baja no se edita: primero
    // habria que reactivarlo, y eso es una decision explicita.
    const parametro = await Parametro.findOne({ _id: id, activo: true });

    if (!parametro) {
      res.status(404).json({ mensaje: 'El parámetro indicado no existe o está inactivo' });
      return;
    }

    const { clave, valor, descripcion } = req.body ?? {};

    // Solo se tocan los campos que vinieron en el body. Ni activo ni los
    // campos de auditoria se leen del cliente: el borrado logico tiene su
    // propio endpoint y las fechas las maneja Mongoose.
    if (clave !== undefined) {
      parametro.clave = clave;
    }

    if (valor !== undefined) {
      parametro.valor = valor;
    }

    if (descripcion !== undefined) {
      parametro.descripcion = descripcion;
    }

    parametro.usuarioActualizacion = await nombreDelUsuario(req);

    await parametro.save();
    invalidarConfiguracionOperativa();

    res.status(200).json(parametro);
  } catch (error) {
    if (respondioErrorDeEscritura(error, res, { mensajeDuplicado: MENSAJE_DUPLICADO })) {
      return;
    }

    console.error('[Parametros] Error al actualizar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/parametros/:id
 *
 * Borrado logico: pasa activo a false. El documento no se borra de la base,
 * asi el historial y la auditoria siguen completos.
 */
export const inactivarParametro = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (respondioIdInvalido(id, res, 'del parámetro')) {
      return;
    }

    const parametro = await Parametro.findOne({ _id: id, activo: true });

    // Si ya estaba inactivo se responde igual que si no existiera: para el
    // cliente el resultado es el mismo y no hay nada que dar de baja.
    if (!parametro) {
      res.status(404).json({ mensaje: 'El parámetro indicado no existe o ya está inactivo' });
      return;
    }

    parametro.activo = false;
    parametro.usuarioActualizacion = await nombreDelUsuario(req);

    await parametro.save();
    invalidarConfiguracionOperativa();

    res.status(200).json({ mensaje: 'Parámetro inactivado', parametro });
  } catch (error) {
    console.error('[Parametros] Error al inactivar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
