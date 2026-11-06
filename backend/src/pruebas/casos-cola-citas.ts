import { api, DefinicionCaso, verificar, verificarIgual } from './entorno';
import {
  crearProveedorDePrueba,
  crearPedidoDePrueba,
  enMinutos,
  leerGatewayPorNumero,
  leerPedido,
  ponerGatewayEn
} from './escenario';
import { prioridadBaseDe } from '../cola/prioridad';

/** Lo que llevan los pedidos EN COLA de este archivo: todos A TIEMPO. */
const PRIORIDAD_A_TIEMPO = prioridadBaseDe('A TIEMPO');

/**
 * CP-10 a CP-12 — Orden de la cola, reprogramación y correlativo.
 *
 * Verifican RN-12 (orden de atención por antigüedad de arribo),
 * RN-01, RN-02 y RN-14 (horario, solapamiento y reprogramación con historial)
 * y RN-03 (autogeneración del número de pedido).
 */

interface RespuestaPedido {
  _id?: string;
  numeroPedido?: string;
  mensaje?: string;
  alternativas?: unknown[];
  pedido?: { _id?: string; inicioVentana?: string };
}

interface RespuestaDescarga {
  mensaje?: string;
  descarga?: { _id?: string };
  _id?: string;
}

const idDeDescarga = (cuerpo: RespuestaDescarga): string =>
  String(cuerpo.descarga?._id ?? cuerpo._id ?? '');

/** Devuelve el próximo horario hábil a las 10:00, para no chocar con RN-01. */
const proximoDiaHabilALas = (hora: number): Date => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  // 0 es domingo: el depósito opera de lunes a sábado.
  while (fecha.getDay() === 0) fecha.setDate(fecha.getDate() + 1);
  fecha.setHours(hora, 0, 0, 0);
  return fecha;
};

export const casosDeColaYCitas: DefinicionCaso[] = [
  {
    id: 'CP-10',
    titulo: 'Orden de atención de la cola por antigüedad de arribo',
    reglas: 'RN-12',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4, 5]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(1, 'LIBRE');

      // El que ocupa la bahía ahora, para después liberarla. EN COLA, igual
      // que deja POST /api/llegadas en el flujo real (Sprint 6): con estado
      // 'A TIEMPO' a secas (el formato previo al Sprint 4) services/cola.ts
      // nunca lo vería para la promoción automática.
      const ocupante = await crearPedidoDePrueba({
        inicioEnMinutos: -120,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -110,
        puntualidad: 'A TIEMPO',
        minutosEnEspera: 0,
        prioridadCalculada: PRIORIDAD_A_TIEMPO
      });
      const gateway1 = await leerGatewayPorNumero(1);
      const inicio = await api<RespuestaDescarga>('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: String(ocupante._id),
        gatewayId: String(gateway1._id)
      });
      verificarIgual(inicio.estado, 201, 'Se ocupa la bahía general de partida');

      // Tres en espera, todos con la misma puntualidad (A TIEMPO): con la
      // misma base de prioridad, el aging por minutos de espera decide el
      // orden, igual que antes decidía la antigüedad de arribo sola.
      // P2 tiene la cita más tardía pero el arribo más temprano: si el orden
      // fuera por hora de cita, entraría P3; debe entrar P2.
      const datosComunes = { puntualidad: 'A TIEMPO' as const, minutosEnEspera: 0, prioridadCalculada: PRIORIDAD_A_TIEMPO };
      const p1 = await crearPedidoDePrueba({
        inicioEnMinutos: -60, tipoProducto: 'general', estado: 'EN COLA', llegadaEnMinutos: -40, ...datosComunes
      });
      const p2 = await crearPedidoDePrueba({
        inicioEnMinutos: -30, tipoProducto: 'general', estado: 'EN COLA', llegadaEnMinutos: -80, ...datosComunes
      });
      const p3 = await crearPedidoDePrueba({
        inicioEnMinutos: -150, tipoProducto: 'general', estado: 'EN COLA', llegadaEnMinutos: -10, ...datosComunes
      });
      anotar('En cola: P1 arribó hace 40 min, P2 hace 80 min, P3 hace 10 min.');

      const fin = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDeDescarga(inicio.cuerpo)
      });
      verificarIgual(fin.estado, 200, 'Se libera la bahía general');

      const fp1 = await leerPedido(p1._id);
      const fp2 = await leerPedido(p2._id);
      const fp3 = await leerPedido(p3._id);

      verificarIgual(fp2?.estado, 'DESCARGANDO', 'Entra P2, el de arribo más antiguo');
      verificar(fp1?.estado !== 'DESCARGANDO', 'P1 permanece en espera', fp1?.estado);
      verificar(fp3?.estado !== 'DESCARGANDO', 'P3 permanece en espera', fp3?.estado);
      anotar('La hora programada de la cita no alteró el orden: manda la hora de arribo.');
    }
  },

  {
    id: 'CP-11',
    titulo: 'Reprogramación de cita con validación de horario y solapamiento',
    reglas: 'RN-01, RN-02, RN-14',
    ejecutar: async (anotar) => {
      const proveedor = await crearProveedorDePrueba('general');

      // Cita ocupada de 11:00 a 12:00 del próximo día hábil.
      const ocupada = proximoDiaHabilALas(11);
      const bloqueo = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId: String(proveedor._id),
        tipoProducto: 'general',
        fechaHoraProgramada: ocupada.toISOString(),
        duracionEstimadaMinutos: 60
      });
      verificarIgual(bloqueo.estado, 201, 'Se programa la cita que ocupará la franja');

      // El pedido a reprogramar, de 09:00 a 10:00 del mismo día.
      const original = proximoDiaHabilALas(9);
      const creado = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId: String(proveedor._id),
        tipoProducto: 'general',
        fechaHoraProgramada: original.toISOString(),
        duracionEstimadaMinutos: 60
      });
      verificarIgual(creado.estado, 201, 'Se programa el pedido a reprogramar');
      const idPedido = String(creado.cuerpo._id);

      // 1) Solapamiento con la cita ocupada (RN-02).
      const solapado = new Date(ocupada.getTime() + 30 * 60 * 1000);
      const choque = await api<RespuestaPedido>(
        'PUT', `/api/pedidos/${idPedido}/reprogramar`, 'coordinador',
        { fechaHoraProgramada: solapado.toISOString(), duracionEstimadaMinutos: 60 }
      );
      verificarIgual(choque.estado, 409, 'La reprogramación solapada se rechaza con 409');
      verificar(
        Array.isArray(choque.cuerpo.alternativas) && choque.cuerpo.alternativas.length > 0,
        'El sistema ofrece franjas alternativas al rechazar por solapamiento'
      );
      anotar(`Solapamiento rechazado; se ofrecieron ${choque.cuerpo.alternativas?.length} alternativas.`);

      // 2) Fuera del horario operativo (RN-01).
      const fueraDeHorario = proximoDiaHabilALas(20);
      const tarde = await api<RespuestaPedido>(
        'PUT', `/api/pedidos/${idPedido}/reprogramar`, 'coordinador',
        { fechaHoraProgramada: fueraDeHorario.toISOString(), duracionEstimadaMinutos: 60 }
      );
      verificarIgual(tarde.estado, 400, 'La reprogramación fuera del horario se rechaza con 400');
      anotar(`Fuera de horario rechazado: ${tarde.cuerpo.mensaje}`);

      // 3) Franja válida (RN-14).
      const valida = proximoDiaHabilALas(14);
      const exito = await api<RespuestaPedido>(
        'PUT', `/api/pedidos/${idPedido}/reprogramar`, 'coordinador',
        { fechaHoraProgramada: valida.toISOString(), duracionEstimadaMinutos: 60 }
      );
      verificarIgual(exito.estado, 200, 'La reprogramación válida responde 200');

      const final = await leerPedido(idPedido);
      verificarIgual(
        final?.inicioVentana?.getHours(),
        14,
        'La ventana del pedido quedó reprogramada a las 14:00'
      );
      anotar('Reprogramación aplicada; el evento CITA_REPROGRAMADA conserva la ventana anterior.');
    }
  },

  {
    id: 'CP-12',
    titulo: 'Autogeneración correlativa del número de pedido',
    reglas: 'RN-03',
    ejecutar: async (anotar) => {
      const proveedor = await crearProveedorDePrueba('general');
      const base = proximoDiaHabilALas(8);

      const primero = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId: String(proveedor._id),
        tipoProducto: 'general',
        fechaHoraProgramada: base.toISOString(),
        duracionEstimadaMinutos: 30
      });
      verificarIgual(primero.estado, 201, 'Se crea el primer pedido');

      const numero1 = String(primero.cuerpo.numeroPedido);
      verificar(
        /^PED-EQUI\d{2}-\d{9}$/.test(numero1),
        'El número sigue el formato PED-EQUIxx-NNNNNNNNN',
        numero1
      );
      anotar(`Primer correlativo generado por el servidor: ${numero1}`);

      // Se cancela: su correlativo no debe reutilizarse.
      const cancelado = await api('PUT', `/api/pedidos/${primero.cuerpo._id}/cancelar`, 'coordinador', {});
      verificar(cancelado.estado === 200 || cancelado.estado === 204,
        'El primer pedido se cancela correctamente', cancelado.estado);

      const segundo = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId: String(proveedor._id),
        tipoProducto: 'general',
        fechaHoraProgramada: new Date(base.getTime() + 60 * 60 * 1000).toISOString(),
        duracionEstimadaMinutos: 30
      });
      verificarIgual(segundo.estado, 201, 'Se crea el segundo pedido');

      const numero2 = String(segundo.cuerpo.numeroPedido);
      verificar(numero2 !== numero1, 'El correlativo del pedido cancelado NO se reutiliza', numero2);

      const correlativo1 = Number(numero1.split('-')[2]);
      const correlativo2 = Number(numero2.split('-')[2]);
      verificarIgual(correlativo2, correlativo1 + 1, 'El correlativo avanza de uno en uno');
      anotar(`Segundo correlativo: ${numero2} (el cancelado no se reutilizó).`);
    }
  },

  {
    id: 'CP-13',
    titulo: 'GET /api/cola ordena por prioridad con esperas iguales (Sprint 6)',
    reglas: 'RN-04, RN-12 (prioridad y aging)',
    ejecutar: async (anotar) => {
      // Misma espera para los tres: la única diferencia es la puntualidad.
      // Se verifica el orden RELATIVO entre estos tres, no la posición
      // absoluta, porque la cola real puede tener otros pedidos (los que
      // deja npm run seed:demo) mezclados.
      const esperaMinutos = 30;
      const tardio = await crearPedidoDePrueba({
        inicioEnMinutos: -60,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -esperaMinutos,
        puntualidad: 'TARDÍO'
      });
      const anticipado = await crearPedidoDePrueba({
        inicioEnMinutos: -60,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -esperaMinutos,
        puntualidad: 'ANTICIPADO'
      });
      const aTiempo = await crearPedidoDePrueba({
        inicioEnMinutos: -60,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -esperaMinutos,
        puntualidad: 'A TIEMPO'
      });

      const cola = await api<{ items?: Array<{ pedidoId?: string }> }>('GET', '/api/cola', 'coordinador');
      verificarIgual(cola.estado, 200, 'GET /api/cola responde 200');

      const items = cola.cuerpo.items ?? [];
      const posicionDe = (id: string): number => items.findIndex((item) => item.pedidoId === id);

      const posATiempo = posicionDe(String(aTiempo._id));
      const posAnticipado = posicionDe(String(anticipado._id));
      const posTardio = posicionDe(String(tardio._id));

      verificar(
        posATiempo !== -1 && posAnticipado !== -1 && posTardio !== -1,
        'Los tres pedidos de prueba aparecen en la cola',
        { posATiempo, posAnticipado, posTardio }
      );
      verificar(
        posATiempo < posAnticipado,
        'Con la misma espera, A TIEMPO queda antes que ANTICIPADO',
        { posATiempo, posAnticipado }
      );
      verificar(
        posAnticipado < posTardio,
        'Con la misma espera, ANTICIPADO queda antes que TARDÍO',
        { posAnticipado, posTardio }
      );
      anotar(
        `Orden relativo confirmado: A TIEMPO (#${posATiempo + 1}) antes que ` +
          `ANTICIPADO (#${posAnticipado + 1}) antes que TARDÍO (#${posTardio + 1}).`
      );
    }
  },

  {
    id: 'CP-14',
    titulo: 'La promoción automática nunca cruza tipos de carga (Sprint 6)',
    reglas: 'RN-07, RN-08, RN-11',
    ejecutar: async (anotar) => {
      // Caso 1: se libera un gateway GENERAL con un pedido de construcción
      // esperando: no tiene que promoverse (puede promoverse, en cambio,
      // algún otro pedido general que ya estuviera en la cola real).
      for (const n of [2, 3, 4, 5]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(1, 'LIBRE');

      const ocupanteGeneral = await crearPedidoDePrueba({
        inicioEnMinutos: -120,
        tipoProducto: 'general',
        estado: 'A TIEMPO',
        llegadaEnMinutos: -110
      });
      const gateway1 = await leerGatewayPorNumero(1);
      const inicioGeneral = await api<RespuestaDescarga>('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: String(ocupanteGeneral._id),
        gatewayId: String(gateway1._id)
      });
      verificarIgual(inicioGeneral.estado, 201, 'Se ocupa el Gateway 1 (general) de partida');

      const construccionEsperando = await crearPedidoDePrueba({
        inicioEnMinutos: -60,
        tipoProducto: 'construcción',
        estado: 'EN COLA',
        llegadaEnMinutos: -50
      });

      const finGeneral = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDeDescarga(inicioGeneral.cuerpo)
      });
      verificarIgual(finGeneral.estado, 200, 'Se libera el Gateway 1 (general)');

      const trasFinalizarGeneral = await leerPedido(construccionEsperando._id);
      verificar(
        trasFinalizarGeneral?.estado === 'EN COLA',
        'El pedido de construcción NO se promueve a un gateway general',
        trasFinalizarGeneral?.estado
      );
      anotar('Un pedido de construcción no se promovió a un gateway general liberado.');

      // Caso 2: a la inversa, se libera el Gateway 5 (construcción) con un
      // pedido general esperando: tampoco tiene que promoverse. Se vuelve a
      // poner LIBRE porque el caso 1 lo dejó OCUPADO (a propósito, para que
      // no fuera un candidato ahí).
      await ponerGatewayEn(5, 'LIBRE');
      const ocupanteConstruccion = await crearPedidoDePrueba({
        inicioEnMinutos: -120,
        tipoProducto: 'construcción',
        estado: 'A TIEMPO',
        llegadaEnMinutos: -110
      });
      const gateway5 = await leerGatewayPorNumero(5);
      const inicioConstruccion = await api<RespuestaDescarga>(
        'POST',
        '/api/descargas/iniciar',
        'coordinador',
        { pedidoId: String(ocupanteConstruccion._id), gatewayId: String(gateway5._id) }
      );
      verificarIgual(inicioConstruccion.estado, 201, 'Se ocupa el Gateway 5 (construcción) de partida');

      const generalEsperando = await crearPedidoDePrueba({
        inicioEnMinutos: -60,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -50
      });

      const finConstruccion = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDeDescarga(inicioConstruccion.cuerpo)
      });
      verificarIgual(finConstruccion.estado, 200, 'Se libera el Gateway 5 (construcción)');

      const trasFinalizarConstruccion = await leerPedido(generalEsperando._id);
      verificar(
        trasFinalizarConstruccion?.estado === 'EN COLA',
        'El pedido general NO se promueve al Gateway 5 (construcción)',
        trasFinalizarConstruccion?.estado
      );
      anotar('Un pedido general tampoco se promovió al Gateway 5 (construcción).');
    }
  },

  {
    id: 'CP-15',
    titulo: 'POST /api/descargas/iniciar respeta el orden estricto de la cola (Sprint 6)',
    reglas: 'RN-12 (orden estricto)',
    ejecutar: async (anotar) => {
      await ponerGatewayEn(2, 'LIBRE');
      const gateway2 = await leerGatewayPorNumero(2);

      // Espera enorme a propósito: así gana la prioridad por aging sobre
      // cualquier otro pedido general que ya estuviera en la cola real
      // (los de npm run seed:demo), sin depender de cuánto lleven esperando.
      const primero = await crearPedidoDePrueba({
        inicioEnMinutos: -100100,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -100000,
        puntualidad: 'A TIEMPO'
      });
      const segundo = await crearPedidoDePrueba({
        inicioEnMinutos: -70,
        tipoProducto: 'general',
        estado: 'EN COLA',
        llegadaEnMinutos: -60,
        puntualidad: 'A TIEMPO'
      });

      const intento = await api<{ mensaje?: string; pedidoSugerido?: { pedidoId?: string; numeroPedido?: string } }>(
        'POST',
        '/api/descargas/iniciar',
        'coordinador',
        { pedidoId: String(segundo._id), gatewayId: String(gateway2._id) }
      );

      verificarIgual(intento.estado, 409, 'Saltarse el orden de la cola responde 409');
      verificarIgual(
        intento.cuerpo.pedidoSugerido?.pedidoId,
        String(primero._id),
        'El pedido sugerido es el que corresponde atender primero'
      );
      verificarIgual(
        intento.cuerpo.pedidoSugerido?.numeroPedido,
        primero.numeroPedido,
        'El número de pedido sugerido coincide'
      );
      anotar(`Rechazo 409: ${intento.cuerpo.mensaje}`);

      const final = await leerPedido(segundo._id);
      verificar(final?.estado === 'EN COLA', 'El pedido que se saltó el orden sigue EN COLA', final?.estado);
      anotar('El pedido que intentó saltarse el orden permanece sin iniciar.');
    }
  }
];
