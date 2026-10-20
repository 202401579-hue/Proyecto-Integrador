import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Infraestructura del banco de pruebas funcionales (CP-01 a CP-12).
 *
 * Estas pruebas NO son unitarias: ejercitan la API REST que está corriendo y
 * verifican el estado que queda en MongoDB. Por eso necesitan las dos puntas,
 * el servidor levantado y la base accesible.
 *
 * La preparación de cada escenario se hace escribiendo en la base y no por la
 * API. Es a propósito: varios casos necesitan un pedido cuya ventana ya pasó,
 * y POST /api/pedidos rechaza las fechas pasadas, que es justamente una de las
 * reglas que el sistema debe cumplir. Preparar por la base permite montar el
 * escenario sin pedirle al endpoint que viole su propia validación. Lo que se
 * prueba siempre es la API, nunca el atajo.
 */

export const BASE_URL = process.env.URL_PRUEBAS ?? `http://localhost:${process.env.PORT ?? 3001}`;

/** Prefijo de los pedidos que crea el banco de pruebas, para poder limpiarlos. */
export const PREFIJO_QA = 'QA-';

export interface Credencial {
  correo: string;
  password: string;
}

export const USUARIOS: Record<'admin' | 'coordinador' | 'operador', Credencial> = {
  admin: { correo: 'admin@logistica.com', password: 'Admin123' },
  coordinador: { correo: 'coordinador@logistica.com', password: 'Coord123' },
  operador: { correo: 'operador@logistica.com', password: 'Oper123' }
};

const tokens = new Map<string, string>();

/** Autentica contra POST /api/auth/login y memoriza el token por usuario. */
export const iniciarSesion = async (quien: keyof typeof USUARIOS): Promise<string> => {
  const guardado = tokens.get(quien);
  if (guardado) return guardado;

  const { correo, password } = USUARIOS[quien];
  const respuesta = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password })
  });

  const cuerpo = (await respuesta.json()) as { token?: string; mensaje?: string };

  if (!respuesta.ok || !cuerpo.token) {
    throw new Error(
      `No se pudo iniciar sesión como ${quien} (${correo}): ` +
        `${respuesta.status} ${cuerpo.mensaje ?? ''}. ` +
        'Verifique que el backend esté corriendo y que se haya ejecutado "npm run seed".'
    );
  }

  tokens.set(quien, cuerpo.token);
  return cuerpo.token;
};

export interface Respuesta<T = Record<string, unknown>> {
  estado: number;
  cuerpo: T;
}

/** Llamada HTTP autenticada a la API bajo prueba. */
export const api = async <T = Record<string, unknown>>(
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ruta: string,
  quien: keyof typeof USUARIOS,
  cuerpo?: unknown
): Promise<Respuesta<T>> => {
  const token = await iniciarSesion(quien);

  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });

  // Un 204 o una respuesta vacía no traen JSON: se devuelve un objeto vacío
  // en lugar de dejar que .json() lance y oculte el código de estado real.
  const texto = await respuesta.text();
  let parseado: unknown = {};

  if (texto.trim() !== '') {
    try {
      parseado = JSON.parse(texto);
    } catch {
      parseado = { textoCrudo: texto };
    }
  }

  return { estado: respuesta.status, cuerpo: parseado as T };
};

// --------------------------------------------------------------- aserciones
export class FalloDePrueba extends Error {}

/** Falla el caso con un mensaje que dice qué se esperaba y qué se obtuvo. */
export const verificar = (condicion: boolean, descripcion: string, obtenido?: unknown): void => {
  if (condicion) return;
  const detalle = obtenido === undefined ? '' : ` — se obtuvo: ${JSON.stringify(obtenido)}`;
  throw new FalloDePrueba(`${descripcion}${detalle}`);
};

export const verificarIgual = <T>(obtenido: T, esperado: T, descripcion: string): void =>
  verificar(obtenido === esperado, `${descripcion} (esperado: ${JSON.stringify(esperado)})`, obtenido);

// ------------------------------------------------------------------ reporte
export interface ResultadoCaso {
  id: string;
  titulo: string;
  reglas: string;
  estado: 'PASS' | 'FAIL';
  observaciones: string[];
  error?: string;
}

const resultados: ResultadoCaso[] = [];

export interface DefinicionCaso {
  id: string;
  titulo: string;
  reglas: string;
  ejecutar: (anotar: (linea: string) => void) => Promise<void>;
}

/** Corre un caso de prueba, lo cronometra y guarda su resultado. */
export const correrCaso = async (caso: DefinicionCaso): Promise<void> => {
  const observaciones: string[] = [];
  const anotar = (linea: string): void => {
    observaciones.push(linea);
  };

  process.stdout.write(`\n▸ ${caso.id} — ${caso.titulo}\n  [${caso.reglas}]\n`);

  try {
    await caso.ejecutar(anotar);
    resultados.push({ ...caso, estado: 'PASS', observaciones });
    observaciones.forEach((o) => process.stdout.write(`    · ${o}\n`));
    process.stdout.write('  ✔ PASS\n');
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    resultados.push({ ...caso, estado: 'FAIL', observaciones, error: mensaje });
    observaciones.forEach((o) => process.stdout.write(`    · ${o}\n`));
    process.stdout.write(`  ✘ FAIL — ${mensaje}\n`);
  }
};

export const obtenerResultados = (): ResultadoCaso[] => [...resultados];

export const imprimirResumen = (): boolean => {
  const aprobados = resultados.filter((r) => r.estado === 'PASS').length;
  const total = resultados.length;

  process.stdout.write('\n' + '='.repeat(72) + '\n');
  process.stdout.write('RESUMEN DE PRUEBAS FUNCIONALES — SumaControl (Grupo N.º 1)\n');
  process.stdout.write('='.repeat(72) + '\n');

  for (const r of resultados) {
    const marca = r.estado === 'PASS' ? '✔' : '✘';
    process.stdout.write(`${marca} ${r.id.padEnd(6)} ${r.estado.padEnd(5)} ${r.titulo}\n`);
    if (r.error) process.stdout.write(`         ↳ ${r.error}\n`);
  }

  process.stdout.write('-'.repeat(72) + '\n');
  process.stdout.write(`Casos aprobados: ${aprobados} de ${total}\n`);
  process.stdout.write(`Fecha de ejecución: ${new Date().toLocaleString('es-SV')}\n`);
  process.stdout.write('='.repeat(72) + '\n');

  return aprobados === total;
};

// ----------------------------------------------------------------- conexión
export const conectar = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('Falta la variable MONGO_URI en el archivo .env del backend.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
};

export const desconectar = async (): Promise<void> => {
  await mongoose.disconnect();
};
