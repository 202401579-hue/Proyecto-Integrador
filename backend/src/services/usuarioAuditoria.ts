import { Request } from 'express';
import mongoose from 'mongoose';
import Usuario from '../models/Usuario';

/**
 * Resuelve el nombre completo del usuario que hace la peticion, para
 * guardarlo en usuarioCreacion / usuarioActualizacion.
 *
 * El JWT solo lleva id, correo y rol: el nombre no viaja en el token. Se
 * podria haber agregado al payload, pero eso obligaria a tocar el login y,
 * peor, el nombre quedaria congelado por 24 horas (lo que dura el token):
 * si el usuario corrige su nombre, la auditoria seguiria escribiendo el
 * viejo hasta que venza la sesion. Por eso se lee de la base en cada
 * escritura, con el id del token como referencia.
 *
 * Es una sola consulta por operacion de escritura, sobre la clave primaria
 * y trayendo un unico campo, asi que no se cachea: el costo es despreciable
 * frente al riesgo de auditar con un nombre desactualizado.
 */
export const nombreDelUsuario = async (req: Request): Promise<string> => {
  const payload = req.usuario;

  // Las rutas del modulo pasan por verificarToken, asi que esto no deberia
  // ocurrir. Se cubre igual para que la auditoria nunca quede vacia.
  if (!payload?.id || !mongoose.isValidObjectId(payload.id)) {
    return payload?.correo ?? 'Desconocido';
  }

  // lean() devuelve un objeto comun en lugar de un documento de Mongoose:
  // aca solo se necesita leer un texto, no guardar nada.
  const usuario = await Usuario.findById(payload.id).select('nombre').lean();

  // El token es valido pero el usuario ya no esta en la base (lo dieron de
  // baja, o el token se emitio contra otra base). Se cae al correo, que
  // igual identifica a quien hizo la operacion.
  return usuario?.nombre ?? payload.correo;
};
