import { api, DefinicionCaso, verificar, verificarIgual } from './entorno';
import {
  crearPedidoDePrueba,
  leerGatewayPorNumero,
  leerPedido,
  ponerGatewayEn
} from './escenario';

/**
 * CP-05 a CP-09 — Asignación de bahías y ciclo de descarga.
 *
 * Verifican RN-07 y RN-08 (compatibilidad y exclusividad del Gateway 5),
 * RN-09 (ocupación atómica), RN-11 (liberación y promoción automática),
 * RN-12 (orden de la cola) y RN-13 (bahía fuera de servicio).
 */

interface RespuestaDescarga {
  mensaje?: string;
  descarga?: { _id?: string };
  _id?: string;
}

/** Deja un pedido con llegada registrada y listo para recibir bahía. */
const pedidoEsperando = async (tipo: 'general' | 'construcción', llegadaHaceMinutos: number) =>
  crearPedidoDePrueba({
    inicioEnMinutos: -llegadaHaceMinutos - 5,
    tipoProducto: tipo,
    estado: 'A TIEMPO',
    llegadaEnMinutos: -llegadaHaceMinutos
  });

/** Inicia una descarga por la API y devuelve el id de la descarga creada. */
const iniciarDescarga = async (pedidoId: string, numeroGateway: number) => {
  const gateway = await leerGatewayPorNumero(numeroGateway);
  return api<RespuestaDescarga>('POST', '/api/descargas/iniciar', 'coordinador', {
    pedidoId,
    gatewayId: String(gateway._id)
  });
};

const idDeDescarga = (cuerpo: RespuestaDescarga): string =>
  String(cuerpo.descarga?._id ?? cuerpo._id ?? '');

export const casosDeGateways: DefinicionCaso[] = [
  {
    id: 'CP-05',
    titulo: 'Producto de construcción asignado al Gateway 5',
    reglas: 'RN-08',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4, 5]) await ponerGatewayEn(n, 'LIBRE');
      const pedido = await pedidoEsperando('construcción', 10);

      // Primero contra una bahía general: debe rechazarse aunque esté libre.
      const enGeneral = await iniciarDescarga(String(pedido._id), 2);
      verificarIgual(enGeneral.estado, 400, 'El Gateway 2 rechaza la carga de construcción');
      anotar(`Gateway 2: ${enGeneral.cuerpo.mensaje}`);

      const enBahia5 = await iniciarDescarga(String(pedido._id), 5);
      verificarIgual(enBahia5.estado, 201, 'El Gateway 5 acepta la carga de construcción');

      const bahia = await leerGatewayPorNumero(5);
      const final = await leerPedido(pedido._id);
      verificarIgual(bahia.estado, 'OCUPADO', 'El Gateway 5 queda OCUPADO');
      verificarIgual(final?.estado, 'DESCARGANDO', 'El pedido pasa a DESCARGANDO');
      anotar('Asignación exclusiva al Gateway 5 confirmada.');
    }
  },

  {
    id: 'CP-06',
    titulo: 'Carga general rechazada en el Gateway 5 con el resto ocupado',
    reglas: 'RN-07, RN-08',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(5, 'LIBRE');

      const pedido = await pedidoEsperando('general', 10);
      const intento = await iniciarDescarga(String(pedido._id), 5);

      verificarIgual(intento.estado, 400, 'El Gateway 5 rechaza la carga general');
      anotar(`Respuesta: ${intento.cuerpo.mensaje}`);

      // La regla se sostiene incluso siendo la única bahía libre: el rechazo
      // no puede dejar la bahía ocupada por error.
      const bahia = await leerGatewayPorNumero(5);
      verificarIgual(bahia.estado, 'LIBRE', 'El Gateway 5 permanece LIBRE tras el rechazo');

      const final = await leerPedido(pedido._id);
      verificar(final?.estado !== 'DESCARGANDO', 'El pedido sigue esperando bahía', final?.estado);
      anotar('La exclusividad se respeta aun siendo la única bahía disponible.');
    }
  },

  {
    id: 'CP-07',
    titulo: 'Finalización de descarga en bahía general y promoción de cola',
    reglas: 'RN-09, RN-11, RN-12',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4, 5]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(1, 'LIBRE');

      const pedidoA = await pedidoEsperando('general', 60);
      const inicio = await iniciarDescarga(String(pedidoA._id), 1);
      verificarIgual(inicio.estado, 201, 'La descarga del pedido A inicia correctamente');

      // B llegó antes que C: al liberarse la bahía debe entrar B.
      const pedidoB = await pedidoEsperando('general', 40);
      const pedidoC = await pedidoEsperando('general', 20);

      const fin = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDeDescarga(inicio.cuerpo)
      });
      verificarIgual(fin.estado, 200, 'POST /api/descargas/finalizar responde 200');

      const finalA = await leerPedido(pedidoA._id);
      verificarIgual(finalA?.estado, 'FINALIZADO', 'El pedido A queda FINALIZADO');

      const finalB = await leerPedido(pedidoB._id);
      const finalC = await leerPedido(pedidoC._id);
      verificarIgual(finalB?.estado, 'DESCARGANDO', 'El pedido B fue promovido a la bahía libre');
      verificar(
        finalC?.estado !== 'DESCARGANDO',
        'El pedido C sigue esperando: llegó después que B',
        finalC?.estado
      );
      anotar('La bahía se reasignó al pedido con la llegada más antigua (B), no al más reciente.');
    }
  },

  {
    id: 'CP-08',
    titulo: 'Finalización en Gateway 5 con promoción filtrada por tipo',
    reglas: 'RN-08, RN-11, RN-12',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(5, 'LIBRE');

      const enDescarga = await pedidoEsperando('construcción', 70);
      const inicio = await iniciarDescarga(String(enDescarga._id), 5);
      verificarIgual(inicio.estado, 201, 'Se ocupa el Gateway 5 con un pedido de construcción');

      // El general lleva más tiempo esperando, pero no es compatible.
      const general = await pedidoEsperando('general', 50);
      const construccion = await pedidoEsperando('construcción', 10);

      const fin = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDeDescarga(inicio.cuerpo)
      });
      verificarIgual(fin.estado, 200, 'La descarga en el Gateway 5 finaliza correctamente');

      const finalConstruccion = await leerPedido(construccion._id);
      const finalGeneral = await leerPedido(general._id);

      verificarIgual(
        finalConstruccion?.estado,
        'DESCARGANDO',
        'El Gateway 5 se reasigna al pedido de construcción'
      );
      verificar(
        finalGeneral?.estado !== 'DESCARGANDO',
        'El pedido general NO entra al Gateway 5 pese a llevar más tiempo esperando',
        finalGeneral?.estado
      );
      anotar('La antigüedad en cola no sobrescribe la exclusividad de RN-08.');
    }
  },

  {
    id: 'CP-09',
    titulo: 'Bahía fuera de servicio excluida de toda asignación',
    reglas: 'RN-13',
    ejecutar: async (anotar) => {
      // Las demas bahias quedan LIBRES a proposito. Si estuvieran ocupadas, el
      // rechazo de la bahia 3 podria atribuirse a la falta de disponibilidad
      // general y no a su estado: el caso pasaria sin probar RN-13. Dejandolas
      // libres, el unico motivo posible de rechazo es que la 3 esta inhabilitada.
      for (const n of [1, 2, 4, 5]) await ponerGatewayEn(n, 'LIBRE');
      await ponerGatewayEn(3, 'FUERA DE SERVICIO');

      const pedido = await pedidoEsperando('general', 15);
      const intento = await iniciarDescarga(String(pedido._id), 3);

      verificarIgual(intento.estado, 400, 'La asignación al Gateway 3 inhabilitado se rechaza');
      anotar(`Rechazo del Gateway 3 (FUERA DE SERVICIO): ${intento.cuerpo.mensaje}`);

      const bahia = await leerGatewayPorNumero(3);
      verificarIgual(
        bahia.estado,
        'FUERA DE SERVICIO',
        'El Gateway 3 conserva su estado tras el intento'
      );

      const trasElIntento = await leerPedido(pedido._id);
      verificar(
        trasElIntento?.estado !== 'DESCARGANDO',
        'El pedido no fue asignado a la bahía inhabilitada',
        trasElIntento?.estado
      );

      // Control del experimento: el mismo pedido, sin cambiarle nada, entra en
      // una bahia sana. Sin esta comprobacion el rechazo anterior podria deberse
      // al pedido y no a la bahia.
      const enBahiaSana = await iniciarDescarga(String(pedido._id), 1);
      verificarIgual(enBahiaSana.estado, 201, 'El mismo pedido sí se acepta en el Gateway 1');

      const final = await leerPedido(pedido._id);
      verificarIgual(final?.estado, 'DESCARGANDO', 'El pedido descarga en la bahía sana');
      anotar('Control: el mismo pedido fue aceptado en el Gateway 1, así que el rechazo ' +
        'anterior se debió al estado de la bahía 3 y no al pedido.');

      // Alcance real de la regla: la promocion automatica apunta siempre a la
      // bahia que acaba de liberarse, y en una bahia inhabilitada no puede
      // haber una descarga que termine. La via automatica queda cubierta por
      // construccion, no por una verificacion aparte.
      anotar('La vía automática no puede alcanzar una bahía inhabilitada: la promoción ' +
        'solo apunta a la bahía que se libera, y allí no puede iniciarse una descarga.');
    }
  }
];
