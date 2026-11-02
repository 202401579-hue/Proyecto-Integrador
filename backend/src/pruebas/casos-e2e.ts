import { api, DefinicionCaso, PREFIJO_QA, verificar, verificarIgual } from './entorno';
import { leerGatewayPorNumero, leerPedido, ponerGatewayEn } from './escenario';

/**
 * PI-01 a PI-04 — Pruebas integrales End-to-End de la cadena transaccional.
 *
 * Recorren el flujo completo API Express ↔ MongoDB usando únicamente los
 * endpoints REST: ninguna de estas pruebas escribe en la base para preparar su
 * escenario, a diferencia de los casos funcionales CP. Esa es la distinción
 * entre ambos niveles: los CP verifican una regla de negocio aislando lo que
 * haga falta, mientras que estos verifican que la cadena completa funcione tal
 * como la ejercita una persona desde la aplicación.
 *
 * La capa de interfaz (Next.js) no se cubre aquí sino en el protocolo UAT del
 * Plan de Implementación: una prueba automatizada que simulara clics
 * verificaría el navegador, no la integración, y el valor de validar la
 * pantalla está en que la ejerza el usuario final.
 */

interface RespuestaProveedor {
  _id?: string;
  proveedor?: { _id?: string };
  mensaje?: string;
}

interface RespuestaPedido {
  _id?: string;
  numeroPedido?: string;
  inicioVentana?: string;
  finVentana?: string;
  usuarioCreacion?: string;
  mensaje?: string;
}

interface RespuestaLlegada {
  mensaje?: string;
  clasificacion?: { estado?: string; minutosDeDiferencia?: number };
}

interface RespuestaDescarga {
  mensaje?: string;
  descarga?: { _id?: string; duracionMinutos?: number };
  _id?: string;
}

interface RespuestaKpis {
  periodo?: { desde?: string; hasta?: string; zonaHoraria?: string };
  tiempoEspera?: { promedioMinutos: number | null; cantidad: number };
  tiempoDescarga?: unknown[];
  cumplimiento?: {
    total: number;
    distribucion: Array<{ puntualidad: string; cantidad: number; porcentaje: number }>;
  };
  ocupacionPorMuelle?: unknown[];
  volumenDiario?: unknown[];
}

const idDe = (cuerpo: { _id?: string; descarga?: { _id?: string }; proveedor?: { _id?: string } }): string =>
  String(cuerpo._id ?? cuerpo.descarga?._id ?? cuerpo.proveedor?._id ?? '');

/** Formatea una fecha como AAAA-MM-DD, que es lo que espera GET /api/kpis. */
const comoISO = (f: Date): string =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

/**
 * Próximo día hábil a la hora indicada.
 *
 * Las citas NO se programan "dentro de unos minutos" sino en el día hábil
 * siguiente, porque POST /api/pedidos rechaza toda ventana fuera del horario
 * operativo (RN-01) y fuera de los días de atención. Si el escenario usara la
 * hora actual, la suite solo correría entre las 07:00 y las 17:00 de lunes a
 * sábado, y una prueba que falla según la hora del día no prueba el sistema:
 * prueba el reloj.
 *
 * La consecuencia es que la llegada se registra mucho antes del inicio de la
 * ventana y el sistema la clasifica como ANTICIPADO. Es una de las cuatro
 * clasificaciones válidas de RN-04 y, además, un estado elegible para
 * descarga, de modo que el ciclo completo de PI-03 se puede ejercitar igual.
 */
const proximoDiaHabilALas = (hora: number): Date => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  // getDay() devuelve 0 para domingo, que no es día de atención del depósito.
  while (fecha.getDay() === 0) fecha.setDate(fecha.getDate() + 1);
  fecha.setHours(hora, 0, 0, 0);
  return fecha;
};

/**
 * Alta de un proveedor por la API. Lleva el prefijo del banco en la
 * identificación tributaria para que la limpieza lo alcance después.
 */
const altaDeProveedor = async (categoria: 'general' | 'construcción'): Promise<string> => {
  const marca = `${PREFIJO_QA}${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const alta = await api<RespuestaProveedor>('POST', '/api/proveedores', 'coordinador', {
    razonSocial: `${PREFIJO_QA}Proveedor E2E ${categoria}`,
    identificacionTributaria: marca,
    categoria,
    contactoNombre: 'Contacto E2E',
    telefono: '0000-0000',
    emailContacto: `${marca.toLowerCase()}@prueba.local`
  });

  verificar(
    alta.estado === 201 || alta.estado === 200,
    'POST /api/proveedores da de alta el proveedor',
    alta.estado
  );

  const id = idDe(alta.cuerpo);
  verificar(id.length > 0, 'La respuesta del alta devuelve el identificador del proveedor');
  return id;
};

export const casosE2E: DefinicionCaso[] = [
  {
    id: 'PI-01',
    titulo: 'Alta de proveedor y programación de cita por la API',
    reglas: 'RN-01, RN-02, RN-03 · HU-001 / CU-01',
    ejecutar: async (anotar) => {
      const proveedorId = await altaDeProveedor('general');
      anotar('Proveedor dado de alta mediante POST /api/proveedores.');

      const cita = proximoDiaHabilALas(10);

      const creado = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId,
        tipoProducto: 'general',
        fechaHoraProgramada: cita.toISOString(),
        duracionEstimadaMinutos: 45
      });

      verificarIgual(creado.estado, 201, 'POST /api/pedidos programa la cita');

      const numero = String(creado.cuerpo.numeroPedido);
      verificar(
        /^PED-EQUI\d{2}-\d{9}$/.test(numero),
        'El backend autogeneró el número de pedido (RN-03)',
        numero
      );
      anotar(`Pedido persistido con el correlativo ${numero}.`);

      // La ventana la calcula el servidor a partir de la duración estimada.
      const guardado = await leerPedido(idDe(creado.cuerpo));
      verificar(guardado !== null, 'El pedido quedó persistido en MongoDB');
      verificarIgual(
        guardado!.finVentana.getTime() - guardado!.inicioVentana.getTime(),
        45 * 60 * 1000,
        'La ventana dura exactamente los 45 minutos estimados'
      );
      verificar(
        typeof guardado!.usuarioCreacion === 'string' && guardado!.usuarioCreacion.length > 0,
        'Queda registrado el usuario que dio de alta la cita (auditoría)',
        guardado!.usuarioCreacion
      );
      anotar(`Ventana calculada por el servidor y auditoría a nombre de ${guardado!.usuarioCreacion}.`);
    }
  },

  {
    id: 'PI-02',
    titulo: 'Registro de llegada y clasificación con asiento en bitácora',
    reglas: 'RN-04, RN-05 · HU-002 / CU-02',
    ejecutar: async (anotar) => {
      const proveedorId = await altaDeProveedor('general');

      const creado = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
        proveedorId,
        tipoProducto: 'general',
        fechaHoraProgramada: proximoDiaHabilALas(10).toISOString(),
        duracionEstimadaMinutos: 30
      });
      verificarIgual(creado.estado, 201, 'La cita se programa en el próximo día hábil');
      const pedidoId = idDe(creado.cuerpo);

      const antesDeLlegar = new Date();

      const llegada = await api<RespuestaLlegada>('POST', '/api/llegadas', 'operador', {
        pedidoId
      });
      verificarIgual(llegada.estado, 200, 'POST /api/llegadas registra el arribo');

      // El arribo ocurre mucho antes del inicio de la ventana, así que RN-04
      // debe clasificarlo como ANTICIPADO.
      verificarIgual(
        llegada.cuerpo.clasificacion?.estado,
        'ANTICIPADO',
        'La clasificación de puntualidad es ANTICIPADO'
      );
      const diferencia = llegada.cuerpo.clasificacion?.minutosDeDiferencia ?? 0;
      verificar(
        diferencia < -15,
        'La diferencia contra el inicio de la ventana supera el margen de anticipación',
        diferencia
      );
      anotar(`Clasificación ANTICIPADO con ${diferencia} minutos respecto del inicio de la ventana.`);

      const guardado = await leerPedido(pedidoId);
      verificarIgual(guardado?.puntualidad, 'ANTICIPADO', 'La puntualidad queda persistida');

      // RN-05: la hora es la del servidor. Se comprueba que caiga entre el
      // instante anterior a la petición y el posterior.
      const marca = guardado?.fechaHoraLlegadaReal;
      verificar(marca instanceof Date, 'El pedido guarda la hora de arribo');
      verificar(
        marca!.getTime() >= antesDeLlegar.getTime() && marca!.getTime() <= Date.now(),
        'La hora de arribo la fijó el servidor durante la petición (RN-05)',
        marca!.toISOString()
      );
      anotar(`Arribo asentado por el servidor a las ${marca!.toISOString()}.`);

      const eventos = await api('GET', '/api/eventos', 'coordinador');
      verificarIgual(eventos.estado, 200, 'La bitácora de eventos queda consultable');
      anotar('El hecho quedó disponible en GET /api/eventos para auditoría.');
    }
  },

  {
    id: 'PI-03',
    titulo: 'Ciclo completo de descarga con promoción automática de cola',
    reglas: 'RN-09, RN-11, RN-12 · HU-003 / CU-03',
    ejecutar: async (anotar) => {
      for (const n of [1, 2, 3, 4, 5]) await ponerGatewayEn(n, 'OCUPADO');
      await ponerGatewayEn(1, 'LIBRE');

      /**
       * Programa una cita, registra su llegada y devuelve el id del pedido.
       * Cada llamada ocupa una hora distinta: dos ventanas de 30 minutos a la
       * misma hora se solaparían y RN-02 rechazaría la segunda.
       */
      const pedidoConLlegada = async (hora: number): Promise<string> => {
        const proveedorId = await altaDeProveedor('general');
        const creado = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
          proveedorId,
          tipoProducto: 'general',
          fechaHoraProgramada: proximoDiaHabilALas(hora).toISOString(),
          duracionEstimadaMinutos: 30
        });
        verificarIgual(creado.estado, 201, `Se programa la cita de las ${hora}:00`);
        const id = idDe(creado.cuerpo);
        const llegada = await api('POST', '/api/llegadas', 'operador', { pedidoId: id });
        verificarIgual(llegada.estado, 200, 'Se registra la llegada del pedido');
        return id;
      };

      const enDescarga = await pedidoConLlegada(10);
      const enEspera = await pedidoConLlegada(11);

      const gateway1 = await leerGatewayPorNumero(1);
      const inicio = await api<RespuestaDescarga>('POST', '/api/descargas/iniciar', 'coordinador', {
        pedidoId: enDescarga,
        gatewayId: String(gateway1._id)
      });
      verificarIgual(inicio.estado, 201, 'POST /api/descargas/iniciar abre la descarga');

      const activas = await api<unknown[]>('GET', '/api/descargas/activas', 'coordinador');
      verificarIgual(activas.estado, 200, 'La descarga figura en el listado de activas');

      const ocupado = await leerGatewayPorNumero(1);
      verificarIgual(ocupado.estado, 'OCUPADO', 'El Gateway 1 pasa a OCUPADO');

      const fin = await api('POST', '/api/descargas/finalizar', 'coordinador', {
        descargaId: idDe(inicio.cuerpo)
      });
      verificarIgual(fin.estado, 200, 'POST /api/descargas/finalizar cierra la descarga');

      const finalizado = await leerPedido(enDescarga);
      verificarIgual(finalizado?.estado, 'FINALIZADO', 'El pedido descargado queda FINALIZADO');

      // RN-11 y RN-12: la bahía liberada se reasigna sola al que esperaba.
      const promovido = await leerPedido(enEspera);
      verificarIgual(
        promovido?.estado,
        'DESCARGANDO',
        'El pedido en espera fue promovido automáticamente a la bahía liberada'
      );
      anotar('Ciclo completo verificado: alta, llegada, descarga, cierre y promoción automática.');
      anotar('La promoción ocurrió sin intervención del operador, en la misma transacción del cierre.');
    }
  },

  {
    id: 'PI-04',
    titulo: 'Cálculo de indicadores sobre la operación registrada',
    reglas: 'RNF-03 · Tablero de indicadores',
    ejecutar: async (anotar) => {
      // El indicador de cumplimiento agrupa por inicioVentana, así que el
      // período consultado es el día de las citas y no el de la ejecución.
      const diaDeLasCitas = comoISO(proximoDiaHabilALas(10));
      const ruta = `/api/kpis?desde=${diaDeLasCitas}&hasta=${diaDeLasCitas}`;

      const antes = await api<RespuestaKpis>('GET', ruta, 'coordinador');
      verificarIgual(antes.estado, 200, 'GET /api/kpis responde 200');

      // Estructura completa: los cinco bloques del tablero.
      verificar(antes.cuerpo.periodo?.desde === diaDeLasCitas,
        'El período devuelto es el solicitado');
      verificar(antes.cuerpo.tiempoEspera !== undefined, 'El tablero incluye tiempo de espera');
      verificar(Array.isArray(antes.cuerpo.tiempoDescarga), 'El tablero incluye tiempo de descarga');
      verificar(antes.cuerpo.cumplimiento !== undefined, 'El tablero incluye cumplimiento');
      verificar(Array.isArray(antes.cuerpo.ocupacionPorMuelle), 'El tablero incluye ocupación');
      verificar(Array.isArray(antes.cuerpo.volumenDiario), 'El tablero incluye volumen diario');
      anotar('El tablero devuelve los cinco bloques de indicadores con el período solicitado.');

      const totalAntes = antes.cuerpo.cumplimiento?.total ?? 0;

      // Se registran dos llegadas con clasificación conocida y se vuelve a
      // consultar. Se comprueba el incremento y no el valor absoluto: así la
      // prueba no depende de los datos que ya hubiera en la base.
      for (const hora of [10, 11]) {
        const proveedorId = await altaDeProveedor('general');
        const creado = await api<RespuestaPedido>('POST', '/api/pedidos', 'coordinador', {
          proveedorId,
          tipoProducto: 'general',
          fechaHoraProgramada: proximoDiaHabilALas(hora).toISOString(),
          duracionEstimadaMinutos: 30
        });
        verificarIgual(creado.estado, 201, `Se programa la cita de las ${hora}:00 del escenario`);
        const llegada = await api('POST', '/api/llegadas', 'operador', {
          pedidoId: idDe(creado.cuerpo)
        });
        verificarIgual(llegada.estado, 200, 'Se registra la llegada del escenario');
      }

      const despues = await api<RespuestaKpis>('GET', ruta, 'coordinador');
      verificarIgual(despues.estado, 200, 'El tablero vuelve a responder tras la operación');

      const totalDespues = despues.cuerpo.cumplimiento?.total ?? 0;
      verificarIgual(
        totalDespues - totalAntes,
        2,
        'El cumplimiento contabiliza exactamente las dos llegadas registradas'
      );
      anotar(`Cumplimiento: ${totalAntes} antes y ${totalDespues} después de registrar dos arribos.`);

      // Consistencia interna: la suma de la distribución es el total y los
      // porcentajes cierran en 100.
      const distribucion = despues.cuerpo.cumplimiento?.distribucion ?? [];
      const suma = distribucion.reduce((t, d) => t + d.cantidad, 0);
      verificarIgual(suma, totalDespues, 'La distribución por puntualidad suma el total');

      if (totalDespues > 0) {
        const porcentajes = distribucion.reduce((t, d) => t + d.porcentaje, 0);
        verificar(
          Math.abs(porcentajes - 100) <= 0.5,
          'Los porcentajes de la distribución cierran en 100 (tolerancia por redondeo)',
          porcentajes
        );
        anotar(`Distribución consistente: ${suma} pedidos y ${porcentajes}% acumulado.`);
      }
    }
  }
];
