import mongoose, { Document, Schema } from 'mongoose';
import { CamposAuditoria, camposAuditoria, opcionesAuditoria } from './auditoria';

/**
 * Parametros de configuracion del sistema.
 *
 * Son los valores que antes estaban fijos en el codigo (el horario operativo
 * y los margenes de tolerancia de las llegadas). Al vivir en la base, el
 * negocio los puede ajustar sin volver a desplegar el backend.
 *
 * El valor se guarda como texto aunque muchos parametros sean numeros: es
 * una tabla generica, y cada modulo interpreta lo que le corresponde (ver
 * services/configuracionOperativa.ts). Asi se pueden agregar parametros de
 * otro tipo mas adelante sin cambiar el esquema.
 */
export interface IParametro extends Document, CamposAuditoria {
  clave: string;
  valor: string;
  descripcion?: string;
}

const ParametroSchema = new Schema<IParametro>(
  {
    clave: {
      type: String,
      required: [true, 'La clave del parámetro es obligatoria'],
      // Es la clave con la que el codigo busca el parametro: si se repitiera,
      // no habria forma de saber cual de los dos valores manda.
      unique: true,
      trim: true,
      // Se normaliza a mayusculas para que HORA_APERTURA y hora_apertura no
      // convivan como dos parametros distintos que dicen lo mismo.
      uppercase: true
    },
    valor: {
      type: String,
      required: [true, 'El valor del parámetro es obligatorio'],
      trim: true
    },
    descripcion: {
      type: String,
      trim: true
    },
    // activo, usuarioCreacion y usuarioActualizacion (ver models/auditoria.ts)
    ...camposAuditoria()
  },
  opcionesAuditoria
);

// El tercer argumento fija el nombre de la coleccion. Sin el, Mongoose
// pluraliza en ingles y la crea como "parametros" igual por casualidad,
// pero se deja explicito para no depender de eso.
export default mongoose.model<IParametro>('Parametro', ParametroSchema, 'parametros');
