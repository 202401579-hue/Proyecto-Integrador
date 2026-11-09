import {
  api,
  apiConToken,
  BASE_URL,
  DefinicionCaso,
  iniciarSesion,
  iniciarSesionConCredenciales,
  verificar,
  verificarIgual
} from './entorno';
import { PREFIJO_RBAC_QA } from './escenario';

/** Pruebas integrales de los permisos dinámicos de Sprint 7. */
type RolBase = 'admin' | 'coordinador' | 'operador';

interface Regla {
  metodo: 'GET' | 'POST' | 'PUT';
  ruta: string;
  permitidos: RolBase[];
}

const MATRIZ: Regla[] = [
  { metodo: 'GET', ruta: '/api/proveedores', permitidos: ['admin', 'coordinador'] },
  { metodo: 'GET', ruta: '/api/pedidos', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'GET', ruta: '/api/kpis', permitidos: ['admin', 'coordinador'] },
  { metodo: 'GET', ruta: '/api/eventos', permitidos: ['admin', 'coordinador'] },
  // Regla explícita del Sprint 7: Coordinador pierde esta lectura.
  { metodo: 'GET', ruta: '/api/parametros', permitidos: ['admin'] },
  { metodo: 'POST', ruta: '/api/parametros', permitidos: ['admin'] },
  { metodo: 'GET', ruta: '/api/gateways', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'GET', ruta: '/api/descargas/activas', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'POST', ruta: '/api/descargas/iniciar', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'POST', ruta: '/api/llegadas', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'POST', ruta: '/api/llegadas/control-ausencias', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'GET', ruta: '/api/cola', permitidos: ['admin', 'coordinador', 'operador'] },
  { metodo: 'GET', ruta: '/api/usuarios', permitidos: ['admin'] },
  { metodo: 'GET', ruta: '/api/roles', permitidos: ['admin'] },
  { metodo: 'GET', ruta: '/api/auth/solo-admin', permitidos: ['admin'] }
];

const ROLES_BASE: RolBase[] = ['admin', 'coordinador', 'operador'];

const sinToken = async (metodo: string, ruta: string): Promise<number> => {
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: metodo === 'GET' ? undefined : '{}'
  });
  return respuesta.status;
};

export const casosDeRbac: DefinicionCaso[] = [
  {
    id: 'PI-05',
    titulo: 'Matriz de permisos dinámicos para los tres roles base',
    reglas: 'Sprint 7 — matriz RBAC',
    ejecutar: async (anotar) => {
      for (const rol of ROLES_BASE) {
        const token = await iniciarSesion(rol);
        verificar(token.length > 0, `${rol} obtiene un ACCESS token`);
      }

      let sinAutorizacion = 0;
      for (const regla of MATRIZ) {
        verificarIgual(
          await sinToken(regla.metodo, regla.ruta),
          401,
          `${regla.metodo} ${regla.ruta} sin token responde 401`
        );
        sinAutorizacion += 1;
      }

      let permitidos = 0;
      let denegados = 0;
      for (const regla of MATRIZ) {
        const cuerpo = regla.metodo === 'GET' ? undefined : {};
        for (const rol of ROLES_BASE) {
          const { estado } = await api(regla.metodo, regla.ruta, rol, cuerpo);
          if (regla.permitidos.includes(rol)) {
            verificar(estado !== 403, `${rol} alcanza ${regla.metodo} ${regla.ruta}`, estado);
            permitidos += 1;
          } else {
            verificarIgual(estado, 403, `${rol} no alcanza ${regla.metodo} ${regla.ruta}`);
            denegados += 1;
          }
        }
      }

      anotar(`${sinAutorizacion} rutas rechazaron solicitudes sin token.`);
      anotar(`${permitidos} combinaciones permitidas y ${denegados} denegadas.`);
      anotar('Coordinador no puede leer /api/parametros: la guía lo asigna al permiso roles.');
    }
  },
  {
    id: 'PI-06',
    titulo: 'Rol personalizado, revocación inmediata y baja protegida',
    reglas: 'Sprint 7 — roles dinámicos',
    ejecutar: async (anotar) => {
      const sufijo = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const nombreRol = `${PREFIJO_RBAC_QA}${sufijo}`;
      const correo = `qa-rbac-${sufijo}@prueba.local`;
      let rolId: string | undefined;
      let usuarioId: string | undefined;

      try {
        const rolCreado = await api<{ rol: { _id: string } }>('POST', '/api/roles', 'admin', {
          nombreRol,
          descripcion: 'Rol temporal de la prueba funcional RBAC',
          permisos: ['kpis']
        });
        verificarIgual(rolCreado.estado, 201, 'POST /api/roles crea el rol personalizado');
        rolId = rolCreado.cuerpo.rol._id;

        const usuarioCreado = await api<{ _id: string; roles: Array<{ nombreRol: string }> }>(
          'POST',
          '/api/usuarios',
          'admin',
          { nombre: 'Usuario RBAC QA', correo, password: 'PruebaRBAC123', roles: [rolId] }
        );
        verificarIgual(usuarioCreado.estado, 201, 'POST /api/usuarios asigna el rol personalizado');
        verificarIgual(usuarioCreado.cuerpo.roles[0]?.nombreRol, nombreRol, 'GET/POST devuelve roles poblados');
        usuarioId = usuarioCreado.cuerpo._id;

        const token = await iniciarSesionConCredenciales(correo, 'PruebaRBAC123');
        verificarIgual((await apiConToken('GET', '/api/kpis', token)).estado, 200, 'Rol kpis obtiene 200');
        verificarIgual(
          (await apiConToken('GET', '/api/proveedores', token)).estado,
          403,
          'Rol kpis recibe 403 fuera de su permiso'
        );

        verificarIgual(
          (await api('DELETE', `/api/roles/${rolId}`, 'admin')).estado,
          409,
          'No se puede desactivar un rol asignado a un usuario activo'
        );

        verificarIgual(
          (
            await api('PUT', `/api/roles/${rolId}`, 'admin', {
              nombreRol,
              descripcion: 'Rol temporal revocado',
              permisos: ['cola']
            })
          ).estado,
          200,
          'PUT modifica permisos del rol'
        );
        verificarIgual(
          (await apiConToken('GET', '/api/kpis', token)).estado,
          403,
          'El mismo token pierde kpis inmediatamente'
        );
        verificarIgual(
          (await apiConToken('GET', '/api/cola', token)).estado,
          200,
          'El mismo token gana cola según la base de datos'
        );
        anotar('La revocación se comprobó con el mismo JWT: checkPermission recargó MongoDB.');
      } finally {
        if (usuarioId) await api('DELETE', `/api/usuarios/${usuarioId}`, 'admin');
        if (rolId) await api('DELETE', `/api/roles/${rolId}`, 'admin');
      }
    }
  }
];
