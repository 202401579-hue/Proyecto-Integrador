import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Gateway, {
  NUMERO_GATEWAY_MAXIMO,
  NUMERO_GATEWAY_MINIMO,
  tipoCargaEsperado
} from '../models/Gateway';

dotenv.config();

/**
 * Las cinco bahias de descarga del deposito.
 *
 * El numero y el tipo de carga no se inventan aca: salen de las reglas del
 * modelo (RN-07 y RN-08), asi que las bahias 1 a 4 quedan en "general" y la
 * 5 en "construcción" sin repetir la regla en dos lugares.
 *
 * A diferencia de los otros seeds, este NO borra la coleccion. Las descargas
 * referencian los gateways por su _id: borrarlos y recrearlos les cambiaria
 * el id y dejaria esas descargas apuntando a bahias que ya no existen. En
 * lugar de eso, cada corrida crea las que falten y deja todas en LIBRE y
 * activas, que es lo que hace falta para arrancar una demo despues de un
 * ensayo. Correrlo dos veces seguidas no duplica nada.
 */
const USUARIO_SEED = 'Seed de gateways';

const sembrar = async (): Promise<void> => {
  await conectarDB();

  const resumen: string[] = [];

  for (let numero = NUMERO_GATEWAY_MINIMO; numero <= NUMERO_GATEWAY_MAXIMO; numero++) {
    const tipoCargaPermitida = tipoCargaEsperado(numero);

    // Se busca sin filtrar por activo: una bahia dada de baja tiene que
    // volver a quedar operativa, no duplicarse.
    const existente = await Gateway.findOne({ numeroGateway: numero });

    if (!existente) {
      // create() y no insertMany(): asi corren las validaciones del esquema
      // (rango del numero, enums, RN-07 y RN-08) igual que en la API.
      const creado = await Gateway.create({
        numeroGateway: numero,
        tipoCargaPermitida,
        estado: 'LIBRE',
        usuarioCreacion: USUARIO_SEED
      });

      resumen.push(
        `  + ${String(creado._id)}  gateway ${numero}  ${tipoCargaPermitida.padEnd(12)}  LIBRE   (creado)`
      );
      continue;
    }

    // Ya existia: se la devuelve al estado de arranque. Se guarda con save()
    // para que pasen las validaciones y los timestamps, como en la API.
    const cambios: string[] = [];

    if (existente.estado !== 'LIBRE') {
      cambios.push(`estado ${existente.estado} -> LIBRE`);
      existente.estado = 'LIBRE';
    }

    if (!existente.activo) {
      cambios.push('reactivada');
      existente.activo = true;
    }

    if (existente.tipoCargaPermitida !== tipoCargaPermitida) {
      cambios.push(`carga ${existente.tipoCargaPermitida} -> ${tipoCargaPermitida}`);
      existente.tipoCargaPermitida = tipoCargaPermitida;
    }

    if (cambios.length > 0) {
      existente.usuarioActualizacion = USUARIO_SEED;
      await existente.save();
    }

    resumen.push(
      `  = ${String(existente._id)}  gateway ${numero}  ${tipoCargaPermitida.padEnd(12)}  LIBRE   ` +
        (cambios.length > 0 ? `(${cambios.join(', ')})` : '(ya estaba lista)')
    );
  }

  console.log(`[Seed gateways] Bahias listas: ${resumen.length}`);
  resumen.forEach((linea) => console.log(linea));
  console.log('[Seed gateways] Las bahias 1 a 4 reciben carga general; la 5, construccion.');
  console.log('[Seed gateways] Todas quedaron en LIBRE y activas.');

  await mongoose.disconnect();
  console.log('[Seed gateways] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed gateways] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
