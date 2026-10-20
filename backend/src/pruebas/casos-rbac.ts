import { api, BASE_URL, DefinicionCaso, iniciarSesion, verificar, verificarIgual } from './entorno';

/**
 * PI-05 — Prueba integral del control de acceso basado en roles.
 *
 * HU-004 y HU-005 / CU-04 y CU-05: cada endpoint protegido declara qué roles
 * lo alcanzan, y el middleware debe hacerlo valer. Es una prueba integral y no
 * unitaria porque recorre la cadena completa: emisión del token en el login,
 * su verificación en verificarToken y la comprobación del rol en
 * autorizarRoles, sobre el servidor Express realmente levantado.
 *
 * Códigos que distingue el backend:
 *   401 — no hay token, o el token es inválido o expiró.
 *   403 — el token es válido pero el rol no alcanza para ese recurso.
 *
 * Sobre los endpoints permitidos se verifica «distinto de 403» en lugar de
 * «200». Varios son POST que, invocados sin un cuerpo válido, responden 400 o
 * 404: eso ya demuestra que la autorización dejó pasar la petición, que es lo
 * que esta prueba mide. Exigir 200 obligaría a montar datos de negocio y
 * convertiría la prueba de permisos en otra cosa.
 */

type Rol = 'admin' | 'coordinador' | 'operador';

interface Regla {
  metodo: 'GET' | 'POST' | 'PUT';
  ruta: string;
  /** Roles que SÍ deben alcanzar el recurso. */
  permitidos: Rol[];
}

const MATRIZ: Regla[] = [
  { metodo: 'GET', ruta: '/api/proveedores', permitidos: ['coordinador'] },
  { metodo: 'GET', ruta: '/api/pedidos', permitidos: ['coordinador'] },
  { metodo: 'GET', ruta: '/api/kpis', permitidos: ['admin', 'coordinador'] },
  { metodo: 'GET', ruta: '/api/eventos', permitidos: ['admin', 'coordinador'] },
  { metodo: 'GET', ruta: '/api/parametros', permitidos: ['admin', 'coordinador'] },
  { metodo: 'POST', ruta: '/api/parametros', permitidos: ['admin'] },
  { metodo: 'GET', ruta: '/api/gateways', permitidos: ['admin', 'coordinador'] },
  { metodo: 'GET', ruta: '/api/descargas/activas', permitidos: ['admin', 'coordinador'] },
  { metodo: 'POST', ruta: '/api/descargas/iniciar', permitidos: ['coordinador', 'operador'] },
  { metodo: 'POST', ruta: '/api/llegadas', permitidos: ['coordinador', 'operador'] },
  { metodo: 'POST', ruta: '/api/llegadas/control-ausencias', permitidos: ['admin', 'coordinador'] }
];

const ROLES: Rol[] = ['admin', 'coordinador', 'operador'];

/** Llamada sin cabecera Authorization, para comprobar el 401. */
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
    titulo: 'Control de acceso basado en roles sobre los endpoints protegidos',
    reglas: 'HU-004, HU-005 · CU-04, CU-05',
    ejecutar: async (anotar) => {
      // 1. Los tres roles obtienen token con sus credenciales sembradas.
      for (const rol of ROLES) {
        const token = await iniciarSesion(rol);
        verificar(token.length > 0, `El rol ${rol} obtiene un token en el login`);
      }
      anotar('Los tres roles autenticaron correctamente contra POST /api/auth/login.');

      // 2. Sin token, todo endpoint protegido responde 401 y ninguno filtra datos.
      let sinAutorizacion = 0;
      for (const regla of MATRIZ) {
        const estado = await sinToken(regla.metodo, regla.ruta);
        verificarIgual(estado, 401, `${regla.metodo} ${regla.ruta} sin token responde 401`);
        sinAutorizacion += 1;
      }
      anotar(`Los ${sinAutorizacion} endpoints protegidos responden 401 cuando no hay token.`);

      // 3. Matriz completa: cada rol contra cada endpoint.
      let denegados = 0;
      let permitidos = 0;

      for (const regla of MATRIZ) {
        // fetch rechaza un GET con cuerpo, asi que solo los POST y PUT lo llevan.
        const cuerpo = regla.metodo === 'GET' ? undefined : {};

        for (const rol of ROLES) {
          const { estado } = await api(regla.metodo, regla.ruta, rol, cuerpo);
          const deberiaPasar = regla.permitidos.includes(rol);

          if (deberiaPasar) {
            verificar(
              estado !== 403,
              `${rol} SÍ debe alcanzar ${regla.metodo} ${regla.ruta} (recibió 403)`,
              estado
            );
            permitidos += 1;
          } else {
            verificarIgual(
              estado,
              403,
              `${rol} NO debe alcanzar ${regla.metodo} ${regla.ruta}`
            );
            denegados += 1;
          }
        }
      }

      anotar(`Matriz verificada: ${permitidos} combinaciones rol-endpoint permitidas y ` +
        `${denegados} denegadas con 403, sobre ${MATRIZ.length} endpoints y ${ROLES.length} roles.`);
      anotar('El Operador no alcanza ningún endpoint de administración ni de consulta de ' +
        'indicadores; el Administrador no registra llegadas ni inicia descargas.');
    }
  }
];
