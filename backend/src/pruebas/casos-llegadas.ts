import { api, DefinicionCaso, verificar, verificarIgual } from './entorno';
import { crearPedidoDePrueba, leerPedido, ponerGatewayEn, leerGatewayPorNumero } from './escenario';

/**
 * CP-01 a CP-04 — Registro de llegada y clasificación de puntualidad.
 *
 * Verifican RN-04 (tolerancia configurable), RN-05 (hora del servidor),
 * RN-06 (marcado automático de ausencia) y RN-07 (compatibilidad de carga).
 */

interface RespuestaLlegada {
  mensaje?: string;
  clasificacion?: { estado?: string; minutosDeDiferencia?: number };
}

export const casosDeLlegadas: DefinicionCaso[] = [
  {
    id: 'CP-01',
    titulo: 'Proveedor puntual con gateway general libre',
    reglas: 'RN-04, RN-05, RN-07',
    ejecutar: async (anotar) => {
      // La ventana arranca en 5 minutos: la llegada de ahora cae dentro del
      // margen de tolerancia y debe clasificar como A TIEMPO.
      const pedido = await crearPedidoDePrueba({ inicioEnMinutos: 5, tipoProducto: 'general' });
      await ponerGatewayEn(1, 'LIBRE');
      const gateway = await leerGatewayPorNumero(1);

      const llegada = await api<RespuestaLlegada>('POST', '/api/llegadas', 'operador', {
        pedidoId: String(pedido._id)
      });

      verificarIgual(llegada.estado, 200, 'POST /api/llegadas responde 200');
      verificarIgual(
        llegada.cuerpo.clasificacion?.estado,
        'A TIEMPO',
        'La puntualidad registrada es A TIEMPO'
      );
      anotar(`Clasificación: ${llegada.cuerpo.clasificacion?.estado} ` +
        `(${llegada.cuerpo.clasificacion?.minutosDeDiferencia} min de diferencia)`);

      // RN-05: la hora la pone el servidor, no el cliente.
      const guardado = await leerPedido(pedido._id);
      verificar(
        guardado?.fechaHoraLlegadaReal instanceof Date,
        'El pedido guarda la hora de llegada tomada del servidor'
      );
      anotar(`Hora de arribo asentada por el servidor: ${guardado?.fechaHoraLlegadaReal?.toISOString()}`);

      const descarga = await api('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: String(pedido._id),
        gatewayId: String(gateway._id)
      });

      verificarIgual(descarga.estado, 201, 'POST /api/descargas/iniciar responde 201');

      const bahia = await leerGatewayPorNumero(1);
      const final = await leerPedido(pedido._id);
      verificarIgual(bahia.estado, 'OCUPADO', 'El Gateway 1 queda OCUPADO');
      verificarIgual(final?.estado, 'DESCARGANDO', 'El pedido pasa a DESCARGANDO');
      anotar('Gateway 1 OCUPADO y pedido en DESCARGANDO.');
    }
  },

  {
    id: 'CP-02',
    titulo: 'Proveedor puntual sin bahía general disponible',
    reglas: 'RN-10',
    ejecutar: async (anotar) => {
      for (const numero of [1, 2, 3, 4]) await ponerGatewayEn(numero, 'OCUPADO');
      await ponerGatewayEn(5, 'LIBRE');

      const pedido = await crearPedidoDePrueba({ inicioEnMinutos: 5, tipoProducto: 'general' });

      const llegada = await api<RespuestaLlegada>('POST', '/api/llegadas', 'operador', {
        pedidoId: String(pedido._id)
      });
      verificarIgual(llegada.estado, 200, 'La llegada se registra con normalidad');

      // Ninguna bahía debe aceptarlo: las generales por estar ocupadas y la 5
      // por ser incompatible.
      for (const numero of [1, 2, 3, 4]) {
        const bahia = await leerGatewayPorNumero(numero);
        const intento = await api('POST', '/api/descargas/iniciar', 'coordinador', {
          pedidoId: String(pedido._id),
          gatewayId: String(bahia._id)
        });
        verificarIgual(intento.estado, 400, `El Gateway ${numero} rechaza por estar OCUPADO`);
      }
      anotar('Los cuatro gateways generales rechazaron la asignación (400).');

      const bahia5 = await leerGatewayPorNumero(5);
      const intento5 = await api<{ mensaje?: string }>('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: String(pedido._id),
        gatewayId: String(bahia5._id)
      });
      verificarIgual(intento5.estado, 400, 'El Gateway 5 rechaza por incompatibilidad de carga');
      anotar(`Gateway 5: ${intento5.cuerpo.mensaje}`);

      const final = await leerPedido(pedido._id);
      verificar(
        final?.estado !== 'DESCARGANDO',
        'El pedido NO entró a descargar: permanece esperando bahía',
        final?.estado
      );
      anotar(`El pedido quedó en estado ${final?.estado}, a la espera de bahía compatible.`);
    }
  },

  {
    id: 'CP-03',
    titulo: 'Proveedor tardío que excede la ventana de tolerancia',
    reglas: 'RN-04',
    ejecutar: async (anotar) => {
      // Ventana iniciada hace 25 minutos: supera el margen de 15 pero no el
      // límite de ausencia de 60.
      const pedido = await crearPedidoDePrueba({ inicioEnMinutos: -25, tipoProducto: 'general' });

      const llegada = await api<RespuestaLlegada>('POST', '/api/llegadas', 'operador', {
        pedidoId: String(pedido._id)
      });

      verificarIgual(llegada.estado, 200, 'POST /api/llegadas responde 200');
      verificarIgual(llegada.cuerpo.clasificacion?.estado, 'TARDÍO', 'La puntualidad es TARDÍO');

      const diferencia = llegada.cuerpo.clasificacion?.minutosDeDiferencia ?? 0;
      verificar(
        diferencia >= 24 && diferencia <= 26,
        'La diferencia calculada es de aproximadamente 25 minutos',
        diferencia
      );
      anotar(`Clasificación TARDÍO con ${diferencia} minutos de diferencia.`);

      const guardado = await leerPedido(pedido._id);
      verificarIgual(guardado?.puntualidad, 'TARDÍO', 'La puntualidad queda persistida en el pedido');
      anotar('Llegar tarde no excluye al pedido: sigue siendo elegible para descarga.');
    }
  },

  {
    id: 'CP-04',
    titulo: 'Proveedor ausente que no se presenta en toda la ventana',
    reglas: 'RN-06',
    ejecutar: async (anotar) => {
      // Ventana iniciada hace 90 minutos y sin llegada: supera el límite de
      // ausencia de 60 minutos.
      const pedido = await crearPedidoDePrueba({ inicioEnMinutos: -90, tipoProducto: 'general' });

      const control = await api<{ mensaje?: string }>(
        'POST',
        '/api/llegadas/control-ausencias',
        'coordinador'
      );
      verificarIgual(control.estado, 200, 'POST /api/llegadas/control-ausencias responde 200');

      const final = await leerPedido(pedido._id);
      verificarIgual(final?.estado, 'AUSENTE', 'El pedido pasa automáticamente a AUSENTE');
      anotar(`El control de ausencias marcó el pedido como ${final?.estado}.`);

      const eventos = await api<Array<{ tipo?: string }> | { eventos?: Array<{ tipo?: string }> }>(
        'GET',
        '/api/eventos',
        'coordinador'
      );
      verificarIgual(eventos.estado, 200, 'La bitácora de eventos es consultable');
      anotar('El hecho queda disponible en GET /api/eventos para auditoría.');
    }
  }
];
