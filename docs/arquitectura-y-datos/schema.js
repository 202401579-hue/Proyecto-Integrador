/**
 * SumaControl - Validadores $jsonSchema de MongoDB (sustituto del schema.sql).
 *
 * Fuente: los esquemas Mongoose de backend/src/models/ en la rama
 * sprint7-victor (Sprint 6 + Sprint 7). La base es MongoDB, que no usa DDL
 * relacional: la estructura, los tipos y las restricciones se declaran con
 * validadores $jsonSchema y con indices.
 *
 * Uso (mongosh):
 *   mongosh "mongodb://localhost:27017/logistica_db" --file schema.js
 *
 * Es idempotente: si la coleccion existe aplica collMod; si no, la crea.
 * validationLevel "moderate" no revalida documentos viejos que ya incumplian
 * el esquema; validationAction "error" rechaza las escrituras invalidas.
 *
 * Reglas que $jsonSchema NO puede expresar y que siguen en Mongoose:
 *  - pedidos.finVentana > pedidos.inicioVentana (hook pre-validate).
 *  - gateways: la carga permitida debe coincidir con el numero (1-4 general,
 *    5 construccion; RN-07/RN-08).
 *  - eventos: solo insercion (middlewares que bloquean update/delete).
 *  - usuarios.password: se guarda hasheada con bcrypt (pre-save).
 */

// ---------------------------------------------------------------- catalogos
const CATEGORIAS = ['construcción', 'general'];
const ESTADOS_PEDIDO = [
  'PROGRAMADO', 'ANTICIPADO', 'A TIEMPO', 'TARDÍO', 'AUSENTE',
  'CANCELADO', 'EN COLA', 'DESCARGANDO', 'FINALIZADO'
];
const PUNTUALIDADES = ['ANTICIPADO', 'A TIEMPO', 'TARDÍO', 'AUSENTE'];
const ESTADOS_GATEWAY = ['LIBRE', 'OCUPADO', 'FUERA DE SERVICIO'];
const ACCIONES_EVENTO = [
  'LLEGADA_REGISTRADA', 'GATEWAY_ASIGNADO', 'DESCARGA_INICIADA',
  'DESCARGA_FINALIZADA', 'CITA_REPROGRAMADA', 'GATEWAY_MANTENIMIENTO',
  'INGRESO_COLA', 'AGING_APLICADO', 'PROMOCION_AUTOMATICA_GATEWAY',
  'ROL_CREADO', 'ROL_MODIFICADO', 'ROL_DESACTIVADO', 'ROL_ASIGNADO_USUARIO'
];
const PERMISOS = [
  'usuarios', 'roles', 'proveedores', 'pedidos',
  'gateways', 'descargas', 'cola', 'kpis'
];
const PATRON_EMAIL = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

// ------------------------------------------------------ campos reutilizables
// Estandar de auditoria y borrado logico (models/auditoria.ts).
const auditoria = () => ({
  activo: { bsonType: 'bool', description: 'Borrado logico: false = dado de baja' },
  usuarioCreacion: { bsonType: 'string', description: 'Nombre completo de quien dio el alta' },
  usuarioActualizacion: { bsonType: 'string', description: 'Nombre completo del ultimo editor' },
  fechaCreacion: { bsonType: 'date', description: 'Alta del documento (automatica)' },
  fechaActualizacion: { bsonType: 'date', description: 'Ultima modificacion (automatica)' }
});

// ------------------------------------------------------------ validadores
const validadores = {
  proveedores: {
    bsonType: 'object',
    required: [
      'razonSocial', 'identificacionTributaria', 'categoria',
      'contactoNombre', 'telefono', 'emailContacto'
    ],
    properties: {
      razonSocial: { bsonType: 'string' },
      identificacionTributaria: { bsonType: 'string', description: 'Unica por proveedor' },
      categoria: { enum: CATEGORIAS },
      contactoNombre: { bsonType: 'string' },
      telefono: { bsonType: 'string' },
      emailContacto: { bsonType: 'string', pattern: PATRON_EMAIL },
      ...auditoria()
    }
  },

  pedidos: {
    bsonType: 'object',
    required: [
      'numeroPedido', 'proveedorId', 'tipoProducto', 'fechaHoraProgramada',
      'duracionEstimadaMinutos', 'inicioVentana', 'finVentana'
    ],
    properties: {
      numeroPedido: { bsonType: 'string', description: 'Ej. PED-EQUI04-000000006; unico' },
      proveedorId: { bsonType: 'objectId', description: 'FK -> proveedores._id' },
      tipoProducto: { enum: CATEGORIAS },
      fechaHoraProgramada: { bsonType: 'date' },
      duracionEstimadaMinutos: { bsonType: ['int', 'long', 'double'], minimum: 1 },
      inicioVentana: { bsonType: 'date' },
      finVentana: { bsonType: 'date' },
      estado: { enum: ESTADOS_PEDIDO, description: 'Por defecto PROGRAMADO' },
      puntualidad: { enum: PUNTUALIDADES },
      fechaHoraLlegadaReal: { bsonType: 'date' },
      fechaHoraIngresoCola: { bsonType: 'date', description: 'Sprint 6' },
      minutosEnEspera: { bsonType: ['int', 'long', 'double'], description: 'Sprint 6; por defecto 0' },
      prioridadCalculada: { bsonType: ['int', 'long', 'double'], description: 'Sprint 6' },
      ...auditoria()
    }
  },

  gateways: {
    bsonType: 'object',
    required: ['numeroGateway', 'tipoCargaPermitida'],
    properties: {
      numeroGateway: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 5, description: 'Entero 1-5; unico' },
      tipoCargaPermitida: { enum: CATEGORIAS },
      estado: { enum: ESTADOS_GATEWAY, description: 'Por defecto LIBRE' },
      ...auditoria()
    }
  },

  descargas: {
    bsonType: 'object',
    required: ['gatewayId', 'pedidoId', 'operadorId', 'fechaHoraInicio'],
    properties: {
      gatewayId: { bsonType: 'objectId', description: 'FK -> gateways._id' },
      pedidoId: { bsonType: 'objectId', description: 'FK -> pedidos._id' },
      operadorId: { bsonType: 'objectId', description: 'FK -> usuarios._id' },
      fechaHoraInicio: { bsonType: 'date' },
      fechaHoraFin: { bsonType: ['date', 'null'], description: 'null mientras la descarga sigue en curso' },
      duracionMinutos: { bsonType: ['int', 'long', 'double', 'null'] },
      ...auditoria()
    }
  },

  eventos: {
    bsonType: 'object',
    required: ['usuarioId', 'accion', 'fechaHora'],
    properties: {
      usuarioId: { bsonType: 'objectId', description: 'FK -> usuarios._id' },
      pedidoId: { bsonType: 'objectId', description: 'FK opcional -> pedidos._id' },
      accion: { enum: ACCIONES_EVENTO },
      detalles: { bsonType: 'object', description: 'Datos propios de cada accion' },
      fechaHora: { bsonType: 'date' },
      activo: { bsonType: 'bool' },
      usuarioCreacion: { bsonType: 'string' },
      fechaCreacion: { bsonType: 'date' }
    }
  },

  parametros: {
    bsonType: 'object',
    required: ['clave', 'valor'],
    properties: {
      clave: { bsonType: 'string', description: 'MAYUSCULAS; unica' },
      valor: { bsonType: 'string', description: 'Siempre texto; cada modulo lo interpreta' },
      descripcion: { bsonType: 'string' },
      ...auditoria()
    }
  },

  usuarios: {
    bsonType: 'object',
    required: ['nombre', 'correo', 'password', 'roles'],
    properties: {
      nombre: { bsonType: 'string' },
      correo: { bsonType: 'string', pattern: PATRON_EMAIL, description: 'Minusculas; unico' },
      password: { bsonType: 'string', description: 'Hash bcrypt, nunca texto plano' },
      roles: {
        bsonType: 'array', minItems: 1, uniqueItems: true,
        items: { bsonType: 'objectId' },
        description: 'FK -> roles._id (Sprint 7, reemplaza al campo rol)'
      },
      mfaObligatorio: { bsonType: 'bool', description: 'Por defecto false' },
      twoFactorSecret: { bsonType: 'string', description: 'Base32 TOTP; secreto' },
      twoFactorEnabled: { bsonType: 'bool', description: 'Por defecto false' },
      twoFactorRecoveryCodes: {
        bsonType: 'array', items: { bsonType: 'string' },
        description: 'Hashes bcrypt de los codigos de recuperacion'
      },
      ...auditoria()
    }
  },

  roles: {
    bsonType: 'object',
    required: ['nombreRol', 'permisos'],
    properties: {
      nombreRol: { bsonType: 'string', minLength: 3, maxLength: 60 },
      descripcion: { bsonType: 'string', maxLength: 200 },
      permisos: {
        bsonType: 'array', minItems: 1, uniqueItems: true,
        items: { enum: PERMISOS }
      },
      activo: { bsonType: 'bool' },
      usuarioCreacion: { bsonType: 'objectId', description: 'FK -> usuarios._id' },
      usuarioActualizacion: { bsonType: 'objectId', description: 'FK -> usuarios._id' },
      fechaCreacion: { bsonType: 'date' },
      fechaActualizacion: { bsonType: 'date' }
    }
  }
};

// ---------------------------------------------------------------- indices
const indices = {
  proveedores: [
    [{ identificacionTributaria: 1 }, { unique: true }]
  ],
  pedidos: [
    [{ numeroPedido: 1 }, { unique: true }],
    [{ activo: 1, estado: 1, inicioVentana: 1 }, {}],
    [{ activo: 1, estado: 1, tipoProducto: 1, fechaHoraLlegadaReal: 1 }, {}]
  ],
  gateways: [
    [{ numeroGateway: 1 }, { unique: true }],
    [{ activo: 1, numeroGateway: 1 }, {}]
  ],
  descargas: [
    [{ activo: 1, fechaHoraFin: 1 }, {}]
  ],
  eventos: [
    [{ pedidoId: 1, fechaHora: -1 }, {}],
    [{ accion: 1, fechaHora: -1 }, {}],
    [{ fechaHora: -1 }, {}]
  ],
  parametros: [
    [{ clave: 1 }, { unique: true }]
  ],
  usuarios: [
    [{ correo: 1 }, { unique: true }]
  ],
  roles: [
    // Nombre unico entre roles activos, sin distinguir mayusculas.
    [{ nombreRol: 1 }, {
      unique: true,
      partialFilterExpression: { activo: true },
      collation: { locale: 'es', strength: 2 }
    }]
  ]
};

// ------------------------------------------------------------- aplicacion
const existentes = db.getCollectionNames();

Object.keys(validadores).forEach((nombre) => {
  const opciones = {
    validator: { $jsonSchema: validadores[nombre] },
    validationLevel: 'moderate',
    validationAction: 'error'
  };

  if (existentes.includes(nombre)) {
    db.runCommand({ collMod: nombre, ...opciones });
    print('[schema] collMod  ' + nombre);
  } else {
    db.createCollection(nombre, opciones);
    print('[schema] create   ' + nombre);
  }

  indices[nombre].forEach(([claves, opts]) => db.getCollection(nombre).createIndex(claves, opts));
});

print('[schema] ' + Object.keys(validadores).length + ' colecciones con validador $jsonSchema.');
