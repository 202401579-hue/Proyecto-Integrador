import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Parametro from '../models/Parametro';
import { CLAVES_PARAMETROS } from '../services/configuracionOperativa';

dotenv.config();

/**
 * Parametros de la cola con prioridad (Sprint 6).
 *
 * Archivo aparte de seedParametros.ts (y no un parametro mas en su lista)
 * porque este va por upsert y el otro por deleteMany+create (ver el
 * comentario de seedParametros.ts). En la demo factor_aging_min y
 * limite_espera_max se ajustan en vivo desde la pantalla de Parametros, y
 * si este script se vuelve a correr despues no tiene que pisar el valor
 * que el usuario ya dejo cargado: upsert con $setOnInsert deja el valor
 * como esta si el parametro ya existe, y lo crea con el valor inicial si
 * todavia no existe.
 */
const USUARIO_SEED = 'Seed de parámetros de la cola';

const parametrosColaPorUpsert = [
  {
    clave: CLAVES_PARAMETROS.factorAgingMin,
    valor: '20',
    descripcion:
      'Minutos de espera en la cola que suman un punto de prioridad por envejecimiento (entero, 1 a 1440)'
  },
  {
    clave: CLAVES_PARAMETROS.limiteEsperaMax,
    valor: '60',
    descripcion:
      'Minutos de espera en la cola a partir de los cuales el pedido se marca con alerta visual (entero, 1 a 1440)'
  }
];

/**
 * Hace el upsert de los dos parametros de la cola. No conecta ni desconecta
 * la base: lo llama tanto este archivo (ejecutado solo) como
 * seedParametros.ts (que ya tiene su propia conexion abierta).
 */
export const sembrarParametrosCola = async (): Promise<void> => {
  for (const parametro of parametrosColaPorUpsert) {
    const resultado = await Parametro.findOneAndUpdate(
      { clave: parametro.clave },
      { $setOnInsert: { ...parametro, usuarioCreacion: USUARIO_SEED } },
      { upsert: true, new: true, runValidators: true }
    );
    console.log(`[Seed parametros cola] (upsert) ${resultado.clave.padEnd(30)} ${resultado.valor}`);
  }
};

/**
 * Guard para poder ejecutar este archivo solo (npm run seed:parametros-cola)
 * sin que, al importar sembrarParametrosCola() desde otro script, se dispare
 * tambien la conexion a la base.
 */
if (require.main === module) {
  (async () => {
    await conectarDB();
    await sembrarParametrosCola();
    await mongoose.disconnect();
    console.log('[Seed parametros cola] Listo.');
  })().catch(async (error) => {
    console.error('[Seed parametros cola] Error:', (error as Error).message);
    await mongoose.disconnect();
    process.exit(1);
  });
}
