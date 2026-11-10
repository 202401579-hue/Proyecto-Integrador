import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Role, { COLLATION_NOMBRE_ROL, PERMISOS_VALIDOS, Permiso } from '../models/Role';
import Usuario from '../models/Usuario';

dotenv.config();

const ROLES_BASE: Array<{ nombreRol: string; descripcion: string; permisos: Permiso[] }> = [
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

interface UsuarioLegacy {
  _id: Types.ObjectId;
  rol?: string;
  roles?: Types.ObjectId[];
}

const asegurarRolesBase = async (): Promise<Map<string, Types.ObjectId>> => {
  const idsPorNombre = new Map<string, Types.ObjectId>();

  for (const base of ROLES_BASE) {
    const rol = await Role.findOneAndUpdate(
      { nombreRol: base.nombreRol },
      {
        $set: { descripcion: base.descripcion, permisos: base.permisos, activo: true },
        $setOnInsert: { nombreRol: base.nombreRol }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        collation: COLLATION_NOMBRE_ROL
      }
    );

    if (!rol) throw new Error(`No se pudo asegurar el rol ${base.nombreRol}`);
    idsPorNombre.set(base.nombreRol.toLocaleLowerCase('es'), rol._id);
  }

  return idsPorNombre;
};

const migrarUsuariosLegacy = async (idsPorNombre: Map<string, Types.ObjectId>): Promise<number> => {
  // Se conserva el campo legacy `rol`: solo se agrega `roles` a usuarios
  // que todavía no tienen asignaciones dinámicas, sin borrar datos previos.
  const usuarios = await Usuario.collection
    .find(
      {
        rol: { $type: 'string' },
        $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }]
      },
      { projection: { rol: 1, roles: 1 } }
    )
    .toArray();

  const operaciones = (usuarios as UsuarioLegacy[])
    .map((usuario) => {
      const rolId = typeof usuario.rol === 'string' ? idsPorNombre.get(usuario.rol.toLocaleLowerCase('es')) : undefined;
      return rolId
        ? {
            updateOne: {
              filter: { _id: usuario._id },
              update: { $set: { roles: [rolId] } }
            }
          }
        : null;
    })
    .filter((operacion): operacion is NonNullable<typeof operacion> => operacion !== null);

  if (operaciones.length === 0) return 0;
  const resultado = await Usuario.collection.bulkWrite(operaciones, { ordered: false });
  return resultado.modifiedCount;
};

const migrar = async (): Promise<void> => {
  await conectarDB();
  const idsPorNombre = await asegurarRolesBase();
  const usuariosMigrados = await migrarUsuariosLegacy(idsPorNombre);

  console.log(`[Migrar roles] Roles base asegurados: ${ROLES_BASE.length}`);
  console.log(`[Migrar roles] Usuarios migrados: ${usuariosMigrados}`);

  await mongoose.disconnect();
};

migrar().catch(async (error) => {
  console.error('[Migrar roles] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
