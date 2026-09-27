import { Response } from 'express';
import mongoose from 'mongoose';

/**
 * Traduce los errores de Mongoose a respuestas de la API.
 *
 * Los tres controladores del modulo repetian el mismo bloque catch. Ademas
 * de la duplicacion, el riesgo era que un error se filtrara tal cual y el
 * usuario viera el texto interno de Mongoose en ingles, por ejemplo
 * "Cast to string failed for value ... at path ...".
 *
 * Devuelve true si ya respondio. Si devuelve false, el error no era del
 * cliente y el controlador tiene que registrarlo y contestar 500.
 */
export const respondioErrorDeEscritura = (
  error: unknown,
  res: Response,
  opciones: { mensajeDuplicado: string; estadoDuplicado?: number }
): boolean => {
  // Campos faltantes, valores fuera de un enum, formatos invalidos:
  // es un error del cliente, no del servidor.
  if (error instanceof mongoose.Error.ValidationError) {
    const primerError = Object.values(error.errors)[0];
    const mensaje =
      primerError instanceof mongoose.Error.CastError
        ? `El campo ${primerError.path} tiene un formato inválido`
        : primerError.message;
    res.status(400).json({ mensaje });
    return true;
  }

  // Un CastError suelto (fuera de una validacion) llega, por ejemplo, cuando
  // se busca por un id con formato de ObjectId invalido.
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ mensaje: `El campo ${error.path} tiene un formato inválido` });
    return true;
  }

  // 11000 es el codigo de MongoDB para una clave unica duplicada. Es la
  // ultima red: el controlador ya suele avisarlo antes con un mensaje propio,
  // pero dos peticiones simultaneas pueden pasar los dos chequeos previos.
  if ((error as { code?: number }).code === 11000) {
    res.status(opciones.estadoDuplicado ?? 409).json({ mensaje: opciones.mensajeDuplicado });
    return true;
  }

  return false;
};
