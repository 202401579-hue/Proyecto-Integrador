import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Proveedor from '../models/Proveedor';
import Pedido from '../models/Pedido';
import { HorarioOperativo, calcularVentana, esDiaHabil } from '../services/ventanaHoraria';
import { obtenerConfiguracionOperativa } from '../services/configuracionOperativa';
import { Tolerancias } from '../services/puntualidad';

dotenv.config();

// Autor que queda en los campos de auditoria de los datos sembrados.
// No son altas hechas por una persona desde la API, y dejarlas sin autor
// haria pensar que la auditoria no funciona.
const USUARIO_SEED = 'Seed de demostración';

/**
 * Datos para la demostracion del modulo de proveedores, pedidos y arribos.
 *
 * Deja la base lista para mostrar los casos de la demo:
 *   1. registrar un proveedor nuevo,
 *   2. crear un pedido valido en un horario libre,
 *   3. provocar un 409 por solapamiento contra el pedido "bloqueador",
 *   4. registrar llegadas y ver las cuatro clasificaciones de puntualidad.
 *
 * Solo toca las colecciones de proveedores y pedidos. Los usuarios
 * se cargan con `npm run seed` y este script nunca los borra.
 */
const proveedoresDePrueba = [
  {
    razonSocial: 'Cementos y Agregados del Valle S.A. de C.V.',
    identificacionTributaria: 'CAV980415KJ2',
    categoria: 'construcción' as const,
    contactoNombre: 'Mariana Torres Quiroga',
    telefono: '+52 55 5614 2290',
    emailContacto: 'compras@cementosdelvalle.com.mx',
    usuarioCreacion: USUARIO_SEED
  },
  {
    razonSocial: 'Distribuidora Comercial Altamira S.A. de C.V.',
    identificacionTributaria: 'DCA120907PL5',
    categoria: 'general' as const,
    contactoNombre: 'Jorge Esteban Ruiz',
    telefono: '+52 55 5382 7741',
    emailContacto: 'ventas@dcaltamira.com.mx',
    usuarioCreacion: USUARIO_SEED
  },
  {
    razonSocial: 'Suministros Industriales Norteños S. de R.L. de C.V.',
    identificacionTributaria: 'SIN150622RT8',
    categoria: 'general' as const,
    contactoNombre: 'Lucía Fernández Ibarra',
    telefono: '+52 81 8345 1167',
    emailContacto: 'contacto@sumnortenos.com.mx',
    usuarioCreacion: USUARIO_SEED
  }
];

// Horario del pedido bloqueador: de 09:00 a 10:00.
const HORA_BLOQUEADOR = 9;
const DURACION_BLOQUEADOR_MINUTOS = 60;

// Codigo de orden de compra del bloqueador. Los pedidos que se creen en
// la demo tienen que usar otro, porque numeroPedido no se puede repetir.
const NUMERO_PEDIDO_BLOQUEADOR = 'OC-2026-0001';

// Duracion de los pedidos preparados para la demo de arribos (HU-02).
const DURACION_ARRIBO_MINUTOS = 30;

/**
 * Pedidos para demostrar el control de arribos.
 *
 * Su ventana se ubica en relacion a la hora en que corre el seed, no a una
 * hora del dia: asi cada POST /api/llegadas de la demo cae siempre en la misma
 * clasificacion, se haga la demo a las 9 de la manana o a las 8 de la noche.
 *
 * Los desfases se calculan con las tolerancias que hay en la base, asi que si
 * alguien cambia un margen por la API, estos pedidos lo acompanan.
 *
 * Nota: estas ventanas pueden caer fuera del horario operativo o en domingo,
 * porque dependen del reloj. Es a proposito: son datos de prueba insertados
 * por el seed, no pedidos programados desde la API, que si valida el horario.
 */
const pedidosDeArribo = (tolerancias: Tolerancias) => [
  {
    numeroPedido: 'OC-2026-0010',
    // Mas de `anticipadoMinutos` en el futuro: registrar la llegada ahora
    // cae antes del margen y clasifica ANTICIPADO.
    minutosDesdeAhora: tolerancias.anticipadoMinutos + 60,
    esperado: 'ANTICIPADO',
    comoDemostrarlo: 'registrar la llegada ahora'
  },
  {
    numeroPedido: 'OC-2026-0011',
    // Arranca en unos minutos: la llegada entra dentro de los margenes.
    minutosDesdeAhora: 5,
    esperado: 'A TIEMPO',
    comoDemostrarlo: 'registrar la llegada ahora'
  },
  {
    numeroPedido: 'OC-2026-0012',
    // Ya empezo, paso el margen tardio pero no el limite de ausencia.
    minutosDesdeAhora: -(tolerancias.tardioMinutos + 15),
    esperado: 'TARDÍO',
    comoDemostrarlo: 'registrar la llegada ahora'
  },
  {
    numeroPedido: 'OC-2026-0013',
    // Paso el limite de ausencia y nadie registro llegada: queda para el
    // control de ausencias (o para mostrar una llegada que llego tardisimo).
    minutosDesdeAhora: -(tolerancias.ausenteMinutos + 30),
    esperado: 'AUSENTE',
    comoDemostrarlo: 'POST /api/llegadas/control-ausencias o un GET /api/pedidos'
  }
];

/**
 * Devuelve el proximo dia de atencion a partir de manana, a las `hora`:00 en
 * la hora local del servidor.
 *
 * Los dias habiles salen de la coleccion parametros, no de una regla fija:
 * con el horario confirmado (lunes a sabado) solo se saltea el domingo, pero
 * si manana el negocio deja de atender los sabados, este seed acompana el
 * cambio sin que haya que tocarlo.
 *
 * Se calcula al correr el script y no se escribe fijo en el codigo: el
 * backend rechaza fechas pasadas, asi que una fecha fija dejaria la demo
 * inservible al dia siguiente.
 */
const proximoDiaHabil = (hora: number, horario: HorarioOperativo): Date => {
  const fecha = new Date();
  fecha.setHours(hora, 0, 0, 0);

  do {
    fecha.setDate(fecha.getDate() + 1);
  } while (!esDiaHabil(fecha, horario));

  return fecha;
};

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/**
 * Formatea una fecha como ISO con la zona horaria local, por ejemplo
 * "2026-09-21T09:30:00-06:00". Es el formato que conviene pegar en el body
 * de Postman: toISOString() la pasaria a UTC y confundiria durante la demo.
 */
const isoLocal = (fecha: Date): string => {
  const desfase = -fecha.getTimezoneOffset();
  const signo = desfase >= 0 ? '+' : '-';
  const horasDesfase = dosDigitos(Math.floor(Math.abs(desfase) / 60));
  const minutosDesfase = dosDigitos(Math.abs(desfase) % 60);

  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:00` +
    `${signo}${horasDesfase}:${minutosDesfase}`
  );
};

const horaCorta = (fecha: Date): string =>
  `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;

const sembrar = async (): Promise<void> => {
  await conectarDB();

  // El horario operativo y las tolerancias viven en la coleccion parametros
  // (npm run seed:parametros). Si faltan, la configuracion cae en sus valores
  // por defecto y avisa por consola.
  const { horario, tolerancias } = await obtenerConfiguracionOperativa();

  // Se borran los pedidos antes que los proveedores para no dejar, ni por
  // un instante, pedidos apuntando a proveedores que ya no existen.
  const pedidosBorrados = await Pedido.deleteMany({});
  const proveedoresBorrados = await Proveedor.deleteMany({});
  console.log(`[Seed demo] Pedidos eliminados: ${pedidosBorrados.deletedCount}`);
  console.log(`[Seed demo] Proveedores eliminados: ${proveedoresBorrados.deletedCount}`);

  // create() y no insertMany(): asi pasan las validaciones del esquema
  // (enum de categoria, formato del email) igual que en la API.
  const proveedores = await Proveedor.create(proveedoresDePrueba);

  console.log(`[Seed demo] Proveedores creados: ${proveedores.length}`);
  proveedores.forEach((proveedor) => {
    console.log(
      `  - ${String(proveedor._id)}  ${proveedor.categoria.padEnd(12)}  ${proveedor.razonSocial}`
    );
  });

  // El bloqueador va asociado al proveedor de construccion.
  const proveedorBloqueador = proveedores[0];
  const ventana = calcularVentana(
    proximoDiaHabil(HORA_BLOQUEADOR, horario),
    DURACION_BLOQUEADOR_MINUTOS
  );

  const bloqueador = await Pedido.create({
    numeroPedido: NUMERO_PEDIDO_BLOQUEADOR,
    proveedorId: proveedorBloqueador._id,
    tipoProducto: 'construcción',
    fechaHoraProgramada: ventana.inicio,
    duracionEstimadaMinutos: DURACION_BLOQUEADOR_MINUTOS,
    inicioVentana: ventana.inicio,
    finVentana: ventana.fin,
    estado: 'PROGRAMADO',
    usuarioCreacion: USUARIO_SEED
  });

  const dia = ventana.inicio.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Horario libre para el pedido valido de la demo: el mismo dia a las 11:00.
  const libre = new Date(ventana.inicio.getTime());
  libre.setHours(11, 0, 0, 0);

  // Horario que choca con el bloqueador: el mismo dia a las 09:30.
  const choque = new Date(ventana.inicio.getTime());
  choque.setHours(9, 30, 0, 0);

  console.log('[Seed demo] Pedido bloqueador creado:');
  console.log(`  - id:        ${String(bloqueador._id)}`);
  console.log(`  - numero:    ${bloqueador.numeroPedido}`);
  console.log(`  - proveedor: ${proveedorBloqueador.razonSocial}`);
  console.log(`  - dia:       ${dia}`);
  console.log(
    `  - horario:   ${horaCorta(ventana.inicio)} a ${horaCorta(ventana.fin)} (${DURACION_BLOQUEADOR_MINUTOS} min, ${bloqueador.estado})`
  );
  console.log(`  - inicio:    ${isoLocal(ventana.inicio)}`);

  // ---------------------------------------------------------------------
  // Pedidos para la demo del control de arribos (HU-02).
  // ---------------------------------------------------------------------
  const arribos = pedidosDeArribo(tolerancias);
  const proveedorArribos = proveedores[1];

  const arribosCreados = await Pedido.create(
    arribos.map((arribo) => {
      const ventanaArribo = calcularVentana(
        new Date(Date.now() + arribo.minutosDesdeAhora * 60 * 1000),
        DURACION_ARRIBO_MINUTOS
      );

      return {
        numeroPedido: arribo.numeroPedido,
        proveedorId: proveedorArribos._id,
        tipoProducto: 'general' as const,
        fechaHoraProgramada: ventanaArribo.inicio,
        duracionEstimadaMinutos: DURACION_ARRIBO_MINUTOS,
        inicioVentana: ventanaArribo.inicio,
        finVentana: ventanaArribo.fin,
        estado: 'PROGRAMADO' as const,
        usuarioCreacion: USUARIO_SEED
      };
    })
  );

  console.log(
    `[Seed demo] Pedidos para el control de arribos: ${arribosCreados.length} ` +
      `(proveedor ${proveedorArribos.razonSocial})`
  );
  console.log(
    `[Seed demo] Tolerancias vigentes: ${tolerancias.anticipadoMinutos} min antes, ` +
      `${tolerancias.tardioMinutos} min despues, limite de ausencia ${tolerancias.ausenteMinutos} min.`
  );
  arribos.forEach((arribo, indice) => {
    const pedido = arribosCreados[indice];
    console.log(
      `  - ${arribo.numeroPedido}  ventana ${horaCorta(pedido.inicioVentana)} a ` +
        `${horaCorta(pedido.finVentana)}  ->  ${arribo.esperado.padEnd(10)} ` +
        `(${arribo.comoDemostrarlo})`
    );
  });

  console.log('[Seed demo] Para la demo (POST /api/pedidos, 60 min):');
  console.log(
    `  - pedido valido -> "numeroPedido": "OC-2026-0002", "fechaHoraProgramada": "${isoLocal(libre)}"`
  );
  console.log(
    `  - solapamiento  -> "numeroPedido": "OC-2026-0003", "fechaHoraProgramada": "${isoLocal(choque)}"`
  );
  console.log('[Seed demo] Para la demo de arribos (POST /api/llegadas, rol Operador):');
  console.log('  - { "numeroPedido": "OC-2026-0010" }  ->  ANTICIPADO');
  console.log('  - { "numeroPedido": "OC-2026-0011" }  ->  A TIEMPO');
  console.log('  - { "numeroPedido": "OC-2026-0012" }  ->  TARDÍO');
  console.log('  - OC-2026-0013 queda sin llegada: POST /api/llegadas/control-ausencias -> AUSENTE');

  await mongoose.disconnect();
  console.log('[Seed demo] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed demo] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
