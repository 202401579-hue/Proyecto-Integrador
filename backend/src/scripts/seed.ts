import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Role, { PERMISOS_VALIDOS, Permiso } from '../models/Role';
import Usuario from '../models/Usuario';

dotenv.config();

/** Roles base definidos por Sprint 7. Se crean antes que los usuarios. */
const rolesBase: Array<{ nombreRol: string; descripcion: string; permisos: Permiso[] }> = [
  {
    nombreRol: 'Administrador',
    descripcion: 'Administración completa del sistema',
    permisos: [...PERMISOS_VALIDOS]
  },
  {
    nombreRol: 'Coordinador',
    descripcion: 'Coordinación operativa y supervisión logística',
    permisos: ['proveedores', 'pedidos', 'gateways', 'descargas', 'cola', 'kpis']
  },
  {
    nombreRol: 'Operador',
    descripcion: 'Operación de llegadas, bahías, descargas y cola',
    permisos: ['pedidos', 'gateways', 'descargas', 'cola']
  }
];

const usuariosDePrueba = [
  { nombre: 'Ana Administradora', correo: 'admin@logistica.com', password: 'Admin123', rolBase: 'Administrador' },
  { nombre: 'Carlos Coordinador', correo: 'coordinador@logistica.com', password: 'Coord123', rolBase: 'Coordinador' },
  { nombre: 'Oscar Operador', correo: 'operador@logistica.com', password: 'Oper123', rolBase: 'Operador' }
];

const sembrar = async (): Promise<void> => {
  await conectarDB();

  // Este script reinicia solo datos de demostración. No se ejecuta durante
  // migraciones ni pruebas unitarias.
  const usuariosBorrados = await Usuario.deleteMany({});
  const rolesBorrados = await Role.deleteMany({});
  console.log(`[Seed] Usuarios eliminados: ${usuariosBorrados.deletedCount}`);
  console.log(`[Seed] Roles eliminados: ${rolesBorrados.deletedCount}`);

  const rolesCreados = await Role.create(rolesBase);
  const rolesPorNombre = new Map(rolesCreados.map((rol) => [rol.nombreRol, rol]));

  const creados = await Usuario.create(
    usuariosDePrueba.map((usuario) => {
      const rol = rolesPorNombre.get(usuario.rolBase);
      if (!rol) throw new Error(`No se creó el rol base ${usuario.rolBase}`);

      return {
        nombre: usuario.nombre,
        correo: usuario.correo,
        password: usuario.password,
        roles: [rol._id],
        activo: true,
        mfaObligatorio: false,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: [],
        usuarioCreacion: 'Sistema (seed inicial)'
      };
    })
  );

  console.log(`[Seed] Roles creados: ${rolesCreados.length}`);
  console.log(`[Seed] Usuarios creados: ${creados.length}`);
  creados.forEach((usuario, indice) => {
    console.log(
      `  - ${usuariosDePrueba[indice].rolBase.padEnd(14)} ${usuario.correo.padEnd(28)} ` +
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
