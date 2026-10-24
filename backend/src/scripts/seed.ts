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
 *
 * Los tres quedan ACTIVOS y SIN MFA, con las mismas credenciales de
 * siempre. Es deliberado: si el seed dejara el segundo factor encendido,
 * ni el banco de pruebas funcionales ni la demo podrian iniciar sesion
 * sin un celular con la aplicacion autenticadora a mano. El MFA se activa
 * despues, desde la API, que es lo que el Sprint 5 tiene que demostrar.
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
].map((usuario) => ({
  ...usuario,
  // Se escriben explicitamente en lugar de confiar en los default del
  // esquema: asi el estado con el que arranca la demostracion se lee aca,
  // y cambiar un default mas adelante no altera en silencio el seed.
  activo: true,
  mfaObligatorio: false,
  twoFactorEnabled: false,
  twoFactorRecoveryCodes: [],
  usuarioCreacion: 'Sistema (seed inicial)'
}));

const sembrar = async (): Promise<void> => {
  await conectarDB();

  // Borra los usuarios existentes para que el script se pueda correr
  // las veces que haga falta sin chocar contra el indice unico del correo.
  // Tambien limpia cualquier secreto de MFA que haya quedado de una demo
  // anterior: los usuarios se recrean desde cero.
  const borrados = await Usuario.deleteMany({});
  console.log(`[Seed] Usuarios eliminados: ${borrados.deletedCount}`);

  // Se usa create() y no insertMany(): insertMany se saltea el middleware
  // pre('save') y guardaria las contrasenas en texto plano.
  const creados = await Usuario.create(usuariosDePrueba);

  console.log(`[Seed] Usuarios creados: ${creados.length}`);
  creados.forEach((usuario) => {
    console.log(
      `  - ${usuario.rol.padEnd(14)} ${usuario.correo.padEnd(28)} ` +
        `activo: ${usuario.activo}  MFA obligatorio: ${usuario.mfaObligatorio}  ` +
        `MFA activo: ${usuario.twoFactorEnabled}`
    );
  });

  await mongoose.disconnect();
  console.log('[Seed] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
