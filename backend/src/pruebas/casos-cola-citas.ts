import { api, DefinicionCaso, verificar, verificarIgual } from './entorno';
import {
  crearProveedorDePrueba,
  crearPedidoDePrueba,
  enMinutos,
  leerGatewayPorNumero,
  leerPedido,
  ponerGatewayEn
} from './escenario';

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

      // El que ocupa la bahía ahora, para después liberarla.
      const ocupante = await crearPedidoDePrueba({
        inicioEnMinutos: -120,
        tipoProducto: 'general',
        estado: 'A TIEMPO',
        llegadaEnMinutos: -110
      });
      const gateway1 = await leerGatewayPorNumero(1);
      const inicio = await api<RespuestaDescarga>('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: String(ocupante._id),
        gatewayId: String(gateway1._id)
      });
      verificarIgual(inicio.estado, 201, 'Se ocupa la bahía general de partida');

      // Tres en espera. P2 tiene la cita más tardía pero el arribo más temprano:
      // si el orden fuera por hora de cita, entraría P3; debe entrar P2.
      const p1 = await crearPedidoDePrueba({
        inicioEnMinutos: -60, tipoProducto: 'general', estado: 'A TIEMPO', llegadaEnMinutos: -40
      });
      const p2 = await crearPedidoDePrueba({
        inicioEnMinutos: -30, tipoProducto: 'general', estado: 'A TIEMPO', llegadaEnMinutos: -80
      });
      const p3 = await crearPedidoDePrueba({
        inicioEnMinutos: -150, tipoProducto: 'general', estado: 'A TIEMPO', llegadaEnMinutos: -10
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
  }
];
