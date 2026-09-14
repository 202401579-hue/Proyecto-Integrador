import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Usuario from '../models/Usuario';

dotenv.config();

/**
 * Usuarios de prueba, uno por cada rol.
 *
 * El enunciado no pide endpoint de registro, asi que sin este script
 * no habria con que probar el login ni con que hacer la demostracion.
 *
 * Las contrasenas van en texto plano SOLO aca: el hook pre('save') del
 * modelo las hashea con bcrypt antes de que toquen la base de datos.
 */
const usuariosDePrueba = [
  {
    nombre: 'Ana Administradora',
    correo: 'admin@logistica.com',
    password: 'Admin123',
    rol: 'Administrador' as const
  },
  {
    nombre: 'Carlos Coordinador',
    correo: 'coordinador@logistica.com',
    password: 'Coord123',
    rol: 'Coordinador' as const
  },
  {
    nombre: 'Oscar Operador',
    correo: 'operador@logistica.com',
    password: 'Oper123',
    rol: 'Operador' as const
  }
];

const sembrar = async (): Promise<void> => {
  await conectarDB();

  // Borra los usuarios existentes para que el script se pueda correr
  // las veces que haga falta sin chocar contra el indice unico del correo.
  const borrados = await Usuario.deleteMany({});
  console.log(`[Seed] Usuarios eliminados: ${borrados.deletedCount}`);

  // Se usa create() y no insertMany(): insertMany se saltea el middleware
  // pre('save') y guardaria las contrasenas en texto plano.
  const creados = await Usuario.create(usuariosDePrueba);

  console.log(`[Seed] Usuarios creados: ${creados.length}`);
  creados.forEach((usuario) => {
    console.log(`  - ${usuario.rol.padEnd(14)} ${usuario.correo}`);
  });

  await mongoose.disconnect();
  console.log('[Seed] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
