import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Parametro from '../models/Parametro';
import { CLAVES_PARAMETROS } from '../services/configuracionOperativa';

dotenv.config();

/**
 * Parametros iniciales de operacion.
 *
 * Son los valores que antes estaban fijos en el codigo. Sin este script la
 * coleccion arranca vacia y el backend cae en sus valores por defecto,
 * avisando por consola: funciona, pero nadie puede ajustar nada desde la API.
 *
 * Solo toca la coleccion parametros. Los usuarios se cargan con
 * `npm run seed` y los proveedores y pedidos con `npm run seed:demo`.
 */
const USUARIO_SEED = 'Seed de parámetros';

const parametrosIniciales = [
  {
    clave: CLAVES_PARAMETROS.horaApertura,
    valor: '7',
    descripcion: 'Hora en que abre el depósito para recibir pedidos (0 a 23)'
  },
  {
    clave: CLAVES_PARAMETROS.horaCierre,
    valor: '17',
    descripcion: 'Hora en que cierra el depósito; la ventana debe terminar antes (1 a 24)'
  },
  {
    clave: CLAVES_PARAMETROS.diasHabiles,
    valor: '1,2,3,4,5,6',
    descripcion: 'Días de atención separados por comas, de lunes (1) a sábado (6); domingo es 0'
  },
  {
    clave: CLAVES_PARAMETROS.toleranciaAnticipadoMinutos,
    valor: '15',
    descripcion:
      'Minutos antes del inicio de la ventana; si el camión llega antes de ese margen, la llegada es ANTICIPADO'
  },
  {
    clave: CLAVES_PARAMETROS.toleranciaTardioMinutos,
    valor: '15',
    descripcion:
      'Minutos después del inicio que todavía se consideran A TIEMPO; pasados esos minutos la llegada es TARDÍO'
  },
  {
    clave: CLAVES_PARAMETROS.toleranciaAusenteMinutos,
    valor: '60',
    descripcion:
      'Minutos después del inicio a partir de los cuales el pedido se considera AUSENTE'
  }
];

const sembrar = async (): Promise<void> => {
  await conectarDB();

  // Se borran los parametros existentes para que el script se pueda correr
  // las veces que haga falta sin chocar contra el indice unico de la clave.
  // Es un script de reinicio, no un endpoint: el borrado logico rige para la
  // API, donde dar de baja tiene que dejar rastro.
  const borrados = await Parametro.deleteMany({});
  console.log(`[Seed parametros] Parametros eliminados: ${borrados.deletedCount}`);

  // create() y no insertMany(): asi pasan las validaciones del esquema
  // (clave obligatoria, normalizacion a mayusculas) igual que en la API.
  const creados = await Parametro.create(
    parametrosIniciales.map((parametro) => ({ ...parametro, usuarioCreacion: USUARIO_SEED }))
  );

  console.log(`[Seed parametros] Parametros creados: ${creados.length}`);
  creados.forEach((parametro) => {
    console.log(`  - ${parametro.clave.padEnd(30)} ${parametro.valor}`);
  });

  console.log('[Seed parametros] Horario operativo: 07:00 a 17:00, de lunes a sabado.');
  console.log(
    '[Seed parametros] Tolerancias: 15 min antes (ANTICIPADO), 15 min despues (A TIEMPO),'
  );
  console.log(
    '[Seed parametros]              hasta 60 min (TARDIO); pasados los 60 min, AUSENTE.'
  );

  await mongoose.disconnect();
  console.log('[Seed parametros] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed parametros] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
