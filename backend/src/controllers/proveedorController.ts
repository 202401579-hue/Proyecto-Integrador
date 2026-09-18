import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Proveedor from '../models/Proveedor';

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
    // colar propiedades extra (por ejemplo _id o createdAt) en el documento.
    const proveedor = await Proveedor.create({
      razonSocial,
      identificacionTributaria,
      categoria,
      contactoNombre,
      telefono,
      emailContacto
    });

    res.status(201).json(proveedor);
  } catch (error) {
    // Campos faltantes, categoria fuera del enum o email mal formado:
    // es un error del cliente, no del servidor. Se devuelve el primer
    // mensaje del esquema, que ya esta redactado para mostrarse.
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

    // 11000 es el codigo de MongoDB para una clave unica duplicada.
    if ((error as { code?: number }).code === 11000) {
      res
        .status(409)
        .json({ mensaje: 'Ya existe un proveedor con esa identificación tributaria' });
      return;
    }

    console.error('[Proveedores] Error al crear:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

/**
 * GET /api/proveedores
 *
 * Devuelve todos los proveedores ordenados por razon social.
 */
export const listarProveedores = async (_req: Request, res: Response): Promise<void> => {
  try {
    const proveedores = await Proveedor.find().sort({ razonSocial: 1 });
    res.status(200).json(proveedores);
  } catch (error) {
    console.error('[Proveedores] Error al listar:', (error as Error).message);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};
