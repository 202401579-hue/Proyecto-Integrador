import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { conectarDB } from '../config/database';
import Proveedor from '../models/Proveedor';
import Pedido from '../models/Pedido';
import { calcularVentana } from '../services/ventanaHoraria';

dotenv.config();

/**
 * Datos para la demostracion del modulo de proveedores y pedidos.
 *
 * Deja la base lista para mostrar los tres casos de la demo:
 *   1. registrar un proveedor nuevo,
 *   2. crear un pedido valido en un horario libre,
 *   3. provocar un 409 por solapamiento contra el pedido "bloqueador".
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
    emailContacto: 'compras@cementosdelvalle.com.mx'
  },
  {
    razonSocial: 'Distribuidora Comercial Altamira S.A. de C.V.',
    identificacionTributaria: 'DCA120907PL5',
    categoria: 'general' as const,
    contactoNombre: 'Jorge Esteban Ruiz',
    telefono: '+52 55 5382 7741',
    emailContacto: 'ventas@dcaltamira.com.mx'
  },
  {
    razonSocial: 'Suministros Industriales Norteños S. de R.L. de C.V.',
    identificacionTributaria: 'SIN150622RT8',
    categoria: 'general' as const,
    contactoNombre: 'Lucía Fernández Ibarra',
    telefono: '+52 81 8345 1167',
    emailContacto: 'contacto@sumnortenos.com.mx'
  }
];

// Horario del pedido bloqueador: de 09:00 a 10:00.
const HORA_BLOQUEADOR = 9;
const DURACION_BLOQUEADOR_MINUTOS = 60;

/**
 * Devuelve el proximo dia habil a partir de manana, a las `hora`:00 en la
 * hora local del servidor. Sabado y domingo se saltean (viernes -> lunes).
 *
 * Se calcula al correr el script y no se escribe fijo en el codigo: el
 * backend rechaza fechas pasadas, asi que una fecha fija dejaria la demo
 * inservible al dia siguiente.
 */
const proximoDiaHabil = (hora: number): Date => {
  const fecha = new Date();
  fecha.setHours(hora, 0, 0, 0);

  do {
    fecha.setDate(fecha.getDate() + 1);
  } while (fecha.getDay() === 0 || fecha.getDay() === 6); // 0 = domingo, 6 = sabado

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
    proximoDiaHabil(HORA_BLOQUEADOR),
    DURACION_BLOQUEADOR_MINUTOS
  );

  const bloqueador = await Pedido.create({
    proveedorId: proveedorBloqueador._id,
    tipoProducto: 'Cemento gris en sacos de 50 kg',
    fechaHoraProgramada: ventana.inicio,
    duracionEstimadaMinutos: DURACION_BLOQUEADOR_MINUTOS,
    inicioVentana: ventana.inicio,
    finVentana: ventana.fin,
    estado: 'PROGRAMADO'
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
  console.log(`  - proveedor: ${proveedorBloqueador.razonSocial}`);
  console.log(`  - dia:       ${dia}`);
  console.log(
    `  - horario:   ${horaCorta(ventana.inicio)} a ${horaCorta(ventana.fin)} (${DURACION_BLOQUEADOR_MINUTOS} min, ${bloqueador.estado})`
  );
  console.log(`  - inicio:    ${isoLocal(ventana.inicio)}`);

  console.log('[Seed demo] Para la demo (POST /api/pedidos, 60 min):');
  console.log(`  - pedido valido -> "fechaHoraProgramada": "${isoLocal(libre)}"`);
  console.log(`  - solapamiento  -> "fechaHoraProgramada": "${isoLocal(choque)}"`);

  await mongoose.disconnect();
  console.log('[Seed demo] Listo.');
};

sembrar().catch(async (error) => {
  console.error('[Seed demo] Error:', (error as Error).message);
  await mongoose.disconnect();
  process.exit(1);
});
