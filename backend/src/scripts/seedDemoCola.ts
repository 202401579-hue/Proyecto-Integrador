import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Proveedor, { IProveedor } from '../models/Proveedor';
import Pedido, { IPedido, Puntualidad, TipoProducto } from '../models/Pedido';
import Usuario from '../models/Usuario';
import Evento from '../models/Evento';
import { obtenerConfiguracionOperativa } from '../services/configuracionOperativa';
import { generarNumeroPedido } from '../services/numeroPedido';
import { clasificarLlegada } from '../services/puntualidad';
import { calcularVentana, esDiaHabil, limitesDelDia } from '../services/ventanaHoraria';
import { ZONA_HORARIA_EL_SALVADOR } from '../services/kpis';
import { prioridadBaseDe } from '../cola/prioridad';
import { programadaParaPuntualidad } from '../cola/programadaParaPuntualidad';

dotenv.config();

/**
 * Datos para la defensa en vivo del Sprint 6 (cola con prioridad).
 *
 * A diferencia de seedParametros.ts y seedDemo.ts, este script NUNCA borra
 * nada (ni deleteMany ni drop): solo agrega. Es pensado para correrse varias
 * veces durante los ensayos de la defensa sin arruinar lo que ya hay en la
 * base, y la unica operacion destructiva que admite (--limpiar-cola) es un
 * CANCELADO explicito, nunca un borrado.
 *
 * Necesita proveedores de categoria "general" y "construccion" ya
 * existentes (los trae `npm run seed:demo`) y al menos un usuario
 * Administrador (lo trae `npm run seed`): si falta cualquiera de los dos,
 * aborta sin escribir nada.
 */

// --------------------------------------------------------------- argumentos
const argv = process.argv.slice(2);

const tieneFlag = (nombre: string): boolean => argv.includes(`--${nombre}`);

const obtenerNumero = (nombre: string, porDefecto: number): number => {
  const prefijo = `--${nombre}=`;
  const argumento = argv.find((valor) => valor.startsWith(prefijo));
  if (argumento === undefined) {
    return porDefecto;
  }
  const valor = Number(argumento.slice(prefijo.length));
  return Number.isFinite(valor) ? valor : porDefecto;
};

/** Minutos desde ahora hasta que se registrarán en vivo las llegadas del grupo B. */
const MINUTOS_HASTA_LLEGADA = obtenerNumero('en-minutos', 10);

/** Si se pasa, cancela (sin borrar) los pedidos EN COLA que ya existían. */
const LIMPIAR_COLA = tieneFlag('limpiar-cola');

const DURACION_MINUTOS = 45;

// ------------------------------------------------------------------ grupo A
/**
 * "Llenabahías": 5 pedidos ya EN COLA (4 "general", 1 "construcción"), con
 * llegadas escalonadas hacia atrás para que, con la misma puntualidad, el
 * aging decida un orden claro de a quién le toca primero en cada bahía.
 */
const GRUPO_A: Array<{ tipoProducto: TipoProducto; minutosAtras: number }> = [
  { tipoProducto: 'general', minutosAtras: 25 },
  { tipoProducto: 'general', minutosAtras: 24 },
  { tipoProducto: 'general', minutosAtras: 23 },
  { tipoProducto: 'general', minutosAtras: 22 },
  { tipoProducto: 'construcción', minutosAtras: 21 }
];

// ------------------------------------------------------------------ grupo B
/**
 * "Para registrar en vivo en caseta": 6 pedidos PROGRAMADO. Cada uno tiene
 * la ventana calculada con programadaParaPuntualidad() para que, al
 * registrar la llegada dentro de MINUTOS_HASTA_LLEGADA, salga clasificado
 * tal cual dice `objetivo`.
 */
const GRUPO_B: Array<{ id: string; tipoProducto: TipoProducto; objetivo: Puntualidad }> = [
  { id: 'B1', tipoProducto: 'general', objetivo: 'TARDÍO' },
  { id: 'B2', tipoProducto: 'general', objetivo: 'ANTICIPADO' },
  { id: 'B3', tipoProducto: 'general', objetivo: 'A TIEMPO' },
  { id: 'B4', tipoProducto: 'construcción', objetivo: 'A TIEMPO' },
  { id: 'B5', tipoProducto: 'construcción', objetivo: 'TARDÍO' },
  { id: 'B6', tipoProducto: 'general', objetivo: 'TARDÍO' }
];

// -------------------------------------------------------------- utilidades
const horaElSalvador = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-SV', {
    timeZone: ZONA_HORARIA_EL_SALVADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(fecha);

/** Proveedor siguiente de la lista, dando la vuelta si ya se usaron todos. */
const siguienteProveedor = (proveedores: IProveedor[], indice: number): IProveedor =>
  proveedores[indice % proveedores.length];

interface FilaTabla {
  numeroPedido: string;
  grupo: string;
  proveedor: string;
  tipoProducto: TipoProducto;
  puntualidadEsperada: string;
  horaProgramada: string;
}

const imprimirTabla = (filas: FilaTabla[]): void => {
  console.log(
    '  Nº pedido'.padEnd(26) +
      'Grupo'.padEnd(8) +
      'Proveedor'.padEnd(42) +
      'Tipo'.padEnd(14) +
      'Puntualidad'.padEnd(13) +
      'Hora programada (El Salvador)'
  );
  filas.forEach((fila) => {
    console.log(
      `  ${fila.numeroPedido}`.padEnd(26) +
        fila.grupo.padEnd(8) +
        fila.proveedor.slice(0, 40).padEnd(42) +
        fila.tipoProducto.padEnd(14) +
        fila.puntualidadEsperada.padEnd(13) +
        fila.horaProgramada
    );
  });
};

// -------------------------------------------------------------------- main
const sembrar = async (): Promise<void> => {
  await conectarDB();

  const { horario, tolerancias, numeroEquipo } = await obtenerConfiguracionOperativa();

  const administrador = await Usuario.findOne({ rol: 'Administrador', activo: true });

  if (!administrador) {
    console.error(
      '[Seed demo cola] No hay ningún usuario Administrador activo. Corra "npm run seed" primero. No se creó nada.'
    );
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const proveedoresGeneral = await Proveedor.find({ categoria: 'general', activo: true });
  const proveedoresConstruccion = await Proveedor.find({ categoria: 'construcción', activo: true });

  if (proveedoresGeneral.length === 0 || proveedoresConstruccion.length === 0) {
    console.error(
      '[Seed demo cola] Faltan proveedores activos de categoría "general" y/o "construcción". ' +
        'Corra "npm run seed:demo" primero (crea los proveedores de la demo). No se creó nada.'
    );
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const ahora = new Date();
  const llegadaPrevista = new Date(ahora.getTime() + MINUTOS_HASTA_LLEGADA * 60 * 1000);

  // Verificacion del grupo B ANTES de escribir nada: si alguna ventana no
  // clasifica como se espera, aborta sin tocar la base. No deberia pasar
  // nunca (programadaParaPuntualidad ya tiene margen de sobra), pero si
  // alguien corre el script con tolerancias extremas (por ejemplo
  // ausenteMinutos muy chico), es mejor frenar aca que sembrar datos que
  // mientan en la demo.
  const ventanasGrupoB = GRUPO_B.map((item) => {
    const ventana = programadaParaPuntualidad(item.objetivo, llegadaPrevista, tolerancias, DURACION_MINUTOS);
    const clasificacion = clasificarLlegada(llegadaPrevista, ventana.inicio, tolerancias);

    if (clasificacion !== item.objetivo) {
      throw new Error(
        `[Seed demo cola] ${item.id}: se esperaba clasificar ${item.objetivo} pero la cuenta da ` +
          `${clasificacion}. Revise las tolerancias vigentes (TOLERANCIA_* en parametros). No se creó nada.`
      );
    }

    return { ...item, ventana };
  });

  // Aviso (no aborta): si el momento en que se van a registrar las llegadas
  // cae fuera del horario operativo o en un dia no habil, el grupo B se crea
  // igual (es codigo de prueba, no una alta por la API), pero conviene que
  // quien ensaya la demo lo sepa de antemano.
  const limites = limitesDelDia(llegadaPrevista, horario);
  const dentroDeHorario =
    esDiaHabil(llegadaPrevista, horario) && llegadaPrevista >= limites.inicio && llegadaPrevista <= limites.fin;

  if (!dentroDeHorario) {
    console.warn(
      `[Seed demo cola] Aviso: dentro de ${MINUTOS_HASTA_LLEGADA} min (${horaElSalvador(llegadaPrevista)}, ` +
        'hora de El Salvador) cae fuera del horario operativo o en un día no hábil. El grupo B se crea igual.'
    );
  }

  // ------------------------------------------------------- --limpiar-cola
  if (LIMPIAR_COLA) {
    const existentes = await Pedido.find({ activo: true, estado: 'EN COLA' }).select(
      'numeroPedido tipoProducto puntualidad'
    );

    console.log(`[Seed demo cola] --limpiar-cola: ${existentes.length} pedido(s) EN COLA antes de sembrar:`);
    existentes.forEach((pedido) => {
      console.log(`  - ${pedido.numeroPedido}  ${pedido.tipoProducto}  ${pedido.puntualidad ?? ''}`);
    });

    if (existentes.length > 0) {
      await Pedido.updateMany(
        { _id: { $in: existentes.map((pedido) => pedido._id) } },
        { estado: 'CANCELADO', usuarioActualizacion: administrador.nombre }
      );
      console.log(`[Seed demo cola] Marcados como CANCELADO (no se borró ninguno).`);
    }
  }

  // ------------------------------------------------------------- grupo A
  const filas: FilaTabla[] = [];
  const creadosGrupoA: IPedido[] = [];
  let indiceGeneral = 0;

  for (const item of GRUPO_A) {
    const proveedor =
      item.tipoProducto === 'construcción'
        ? proveedoresConstruccion[0]
        : siguienteProveedor(proveedoresGeneral, indiceGeneral++);

    const horaLlegada = new Date(ahora.getTime() - item.minutosAtras * 60 * 1000);
    const ventana = calcularVentana(horaLlegada, DURACION_MINUTOS);
    const puntualidad: Puntualidad = 'A TIEMPO';

    const pedido = await Pedido.create({
      numeroPedido: await generarNumeroPedido(numeroEquipo),
      proveedorId: proveedor._id,
      tipoProducto: item.tipoProducto,
      fechaHoraProgramada: ventana.inicio,
      duracionEstimadaMinutos: DURACION_MINUTOS,
      inicioVentana: ventana.inicio,
      finVentana: ventana.fin,
      estado: 'EN COLA',
      puntualidad,
      fechaHoraLlegadaReal: ventana.inicio,
      fechaHoraIngresoCola: ventana.inicio,
      minutosEnEspera: 0,
      prioridadCalculada: prioridadBaseDe(puntualidad),
      usuarioCreacion: administrador.nombre
    });

    creadosGrupoA.push(pedido);

    await Evento.create({
      usuarioId: administrador._id,
      pedidoId: pedido._id,
      accion: 'INGRESO_COLA',
      detalles: {
        numeroPedido: pedido.numeroPedido,
        puntualidad,
        prioridadCalculada: pedido.prioridadCalculada
      },
      fechaHora: new Date(),
      usuarioCreacion: administrador.nombre
    });

    filas.push({
      numeroPedido: pedido.numeroPedido,
      grupo: 'A',
      proveedor: proveedor.razonSocial,
      tipoProducto: item.tipoProducto,
      puntualidadEsperada: puntualidad,
      horaProgramada: horaElSalvador(ventana.inicio)
    });
  }

  // ------------------------------------------------------------- grupo B
  indiceGeneral = 0;

  for (const { id, tipoProducto, objetivo, ventana } of ventanasGrupoB) {
    const proveedor =
      tipoProducto === 'construcción'
        ? proveedoresConstruccion[0]
        : siguienteProveedor(proveedoresGeneral, indiceGeneral++);

    const pedido = await Pedido.create({
      numeroPedido: await generarNumeroPedido(numeroEquipo),
      proveedorId: proveedor._id,
      tipoProducto,
      fechaHoraProgramada: ventana.inicio,
      duracionEstimadaMinutos: DURACION_MINUTOS,
      inicioVentana: ventana.inicio,
      finVentana: ventana.fin,
      estado: 'PROGRAMADO',
      usuarioCreacion: administrador.nombre
    });

    filas.push({
      numeroPedido: pedido.numeroPedido,
      grupo: `B (${id})`,
      proveedor: proveedor.razonSocial,
      tipoProducto,
      puntualidadEsperada: objetivo,
      horaProgramada: horaElSalvador(ventana.inicio)
    });
  }

  console.log(
    `[Seed demo cola] Grupo A (ya EN COLA): ${creadosGrupoA.length} pedidos. ` +
      `Grupo B (PROGRAMADO, a registrar en ~${MINUTOS_HASTA_LLEGADA} min): ${GRUPO_B.length} pedidos.`
  );
  console.log('');
  imprimirTabla(filas);

  console.log('');
  console.log('[Seed demo cola] Orden recomendado para la demo:');
  console.log('  1. GET /api/cola: mostrar el orden del grupo A (los "general" por aging, el de construcción solo).');
  console.log('  2. POST /api/descargas/iniciar en los gateways 1 a 4 con los pedidos "general" del grupo A, en el orden que muestra la cola.');
  console.log('  3. POST /api/descargas/iniciar en el gateway 5 con el pedido "construcción" del grupo A.');
  console.log(
    `  4. Esperar a que pase el horario objetivo (${horaElSalvador(llegadaPrevista)}, hora de El Salvador) y, ` +
      'con el rol Operador, registrar la llegada de cada pedido del grupo B (POST /api/llegadas) para ver las ' +
      'seis clasificaciones en vivo.'
  );
  console.log('  5. POST /api/descargas/finalizar sobre cualquiera de las descargas del paso 2 o 3: ver la promoción automática tomar al siguiente de la cola (ahora con pedidos del grupo B adentro).');

  await mongoose.disconnect();
  console.log('[Seed demo cola] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed demo cola] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
