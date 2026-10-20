import {
  BASE_URL,
  conectar,
  correrCaso,
  desconectar,
  imprimirResumen,
  iniciarSesion
} from './entorno';
import {
  limpiarDatosDePrueba,
  limpiarPedidosHuerfanos,
  verificarBahiasSembradas
} from './escenario';
import { casosDeLlegadas } from './casos-llegadas';
import { casosDeGateways } from './casos-gateways';
import { casosDeColaYCitas } from './casos-cola-citas';
import { casosDeRbac } from './casos-rbac';

/**
 * Corredor del banco de pruebas: los 12 casos funcionales CP-01 a CP-12 y la
 * prueba integral de control de acceso por roles PI-05.
 *
 * Requiere el backend corriendo (npm run dev) y MongoDB accesible. Antes de
 * cada caso limpia lo que dejó el anterior, para que el orden de ejecución no
 * cambie el resultado: un caso que solo pasa porque corrió después de otro no
 * prueba nada.
 *
 *   npm run test:funcional
 */

const CASOS = [...casosDeLlegadas, ...casosDeGateways, ...casosDeColaYCitas, ...casosDeRbac];

const main = async (): Promise<void> => {
  process.stdout.write('\n' + '='.repeat(72) + '\n');
  process.stdout.write('PRUEBAS FUNCIONALES — SumaControl (Grupo N.º 1)\n');
  process.stdout.write(`API bajo prueba: ${BASE_URL}\n`);
  process.stdout.write('='.repeat(72) + '\n');

  await conectar();
  process.stdout.write('→ Conectado a MongoDB.\n');

  await verificarBahiasSembradas();
  process.stdout.write('→ Las cinco bahías están sembradas y con su tipo de carga correcto.\n');

  const huerfanos = await limpiarPedidosHuerfanos();
  process.stdout.write(
    `→ Residuos de corridas anteriores eliminados: ${huerfanos} pedido(s) sin proveedor.\n`
  );

  await iniciarSesion('coordinador');
  process.stdout.write('→ Autenticación verificada contra POST /api/auth/login.\n');

  for (const caso of CASOS) {
    // Cada caso arranca de cero: sin esto, una bahía que quedó ocupada por el
    // caso anterior haría fallar al siguiente por un motivo que no es suyo.
    await limpiarDatosDePrueba();
    await correrCaso(caso);
  }

  await limpiarDatosDePrueba();
  process.stdout.write('\n→ Datos de prueba eliminados; las bahías volvieron a LIBRE.\n');

  const todoAprobado = imprimirResumen();

  await desconectar();
  process.exitCode = todoAprobado ? 0 : 1;
};

main().catch(async (error) => {
  process.stderr.write(`\n✘ No se pudo completar la corrida: ${(error as Error).message}\n\n`);
  process.stderr.write(
    'Antes de reintentar verifique que:\n' +
      '  1. El backend esté corriendo (npm run dev en otra terminal).\n' +
      '  2. MongoDB esté levantado y MONGO_URI apunte a esa base.\n' +
      '  3. Se hayan ejecutado npm run seed, seed:gateways y seed:parametros.\n\n'
  );
  await desconectar().catch(() => undefined);
  process.exitCode = 1;
});
