# Backend — Autenticación y autorización con JWT

Sprint 0 · Parte 1 · Proyecto Integrador de Gestión Logística

Servidor Express en TypeScript conectado a MongoDB local, con el modelo de
usuario y el endpoint de login que devuelve un JWT.

---

## Requisitos

- Node.js 18 o superior
- MongoDB Community Server corriendo en `localhost:27017`

---

## Puesta en marcha

```bash
cd backend
npm install
cp .env.example .env     # y completar los valores (ver abajo)
npm run seed             # carga los tres usuarios de prueba
npm run dev              # levanta el servidor en http://localhost:4000
```

### Variables de entorno

| Clave | Valor de ejemplo | Para qué sirve |
|---|---|---|
| `PORT` | `4000` | Puerto del backend (acuerdo del equipo) |
| `MONGO_URI` | `mongodb://localhost:27017/logistica_db` | Base de datos local |
| `JWT_SECRET` | cadena aleatoria larga | Secreto con el que se firman los tokens |

El `.env` **no se sube al repositorio** (está en el `.gitignore`). Cada
integrante copia el `.env.example` y completa sus valores.

Para generar un `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en modo desarrollo, recarga al guardar |
| `npm run seed` | Borra los usuarios y recrea los tres de prueba |
| `npm run seed:parametros` | Borra los parámetros y recarga los iniciales: horario operativo y tolerancias |
| `npm run seed:demo` | Borra proveedores y pedidos y carga los datos de la demo (no toca usuarios ni parámetros) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la versión compilada |

---

## Usuarios de prueba

Los crea `npm run seed`. **Todo el equipo usa estos mismos.**

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@logistica.com` | `Admin123` |
| Coordinador | `coordinador@logistica.com` | `Coord123` |
| Operador | `operador@logistica.com` | `Oper123` |

Las contraseñas se guardan hasheadas con bcrypt; en la base nunca hay texto plano.

---

## Endpoints

### `POST /api/auth/login`

Cuerpo de la petición:

```json
{ "correo": "operador@logistica.com", "password": "Oper123" }
```

Respuesta correcta (200):

```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

Respuesta de error (401), **igual para correo inexistente y para contraseña
incorrecta**, para no revelar qué correos están registrados:

```json
{ "mensaje": "Credenciales inválidas" }
```

El payload del token lleva `id`, `correo` y `rol`, y expira a las 24 horas.
Nunca lleva la contraseña ni el hash.

### Rutas de demostración del RBAC

No las pide el Sprint 0; existen para poder probar los middlewares y mostrarlos
en la defensa. Se envía la cabecera `Authorization: Bearer <token>`.

| Ruta | Requiere | Respuesta si no cumple |
|---|---|---|
| `GET /api/auth/perfil` | token válido | 401 |
| `GET /api/auth/solo-admin` | token válido + rol `Administrador` | 403 |

### `GET /api/health`

Comprueba que el servidor está arriba: `{ "estado": "ok" }`.

---

## Sprint 1 — Proveedores y programación de pedidos

> El Sprint 2 cambió parte de esto: los `GET` ahora devuelven solo los
> registros activos, el horario operativo se lee de la colección `parametros`
> y se sumaron los campos de auditoría. Las diferencias están marcadas abajo y
> resumidas en **Cambios en los endpoints del Sprint 1**.

Módulo del rol **Coordinador**. Todas las rutas piden la cabecera
`Authorization: Bearer <token>` de un usuario Coordinador: sin token responden
**401** y con otro rol **403**.

Todas las respuestas de error llevan la clave `mensaje`.

### `POST /api/proveedores`

```json
{
  "razonSocial": "Cementos del Norte SA",
  "identificacionTributaria": "30-71234567-9",
  "categoria": "construcción",
  "contactoNombre": "Laura Gómez",
  "telefono": "+52 55 1234 5678",
  "emailContacto": "laura@cementosnorte.com"
}
```

| Respuesta | Cuándo |
|---|---|
| **201** con el proveedor creado | Datos correctos |
| **400** `{ "mensaje": "..." }` | Falta un campo, email mal formado o categoría inválida |
| **409** `{ "mensaje": "Ya existe un proveedor con esa identificación tributaria" }` | La identificación tributaria ya está registrada |

- `categoria` acepta solo `"construcción"` o `"general"`, en minúscula y con tilde.
- `emailContacto` se valida en el backend: tiene que tener la forma
  `usuario@dominio.ext`, sin espacios. Si no, **400** `"El email de contacto no es válido"`.

### `GET /api/proveedores`

**200** con el arreglo de proveedores, ordenado por razón social. Desde el
Sprint 2 devuelve **solo los activos**, salvo con `?incluirInactivos=true`.

### `POST /api/pedidos`

```json
{
  "numeroPedido": "OC-2026-0001",
  "proveedorId": "6aad7047b8519521f86f6bbc",
  "tipoProducto": "construcción",
  "fechaHoraProgramada": "2026-09-21T09:00:00-06:00",
  "duracionEstimadaMinutos": 90
}
```

Los cinco campos son obligatorios.

- `numeroPedido`: código de la orden de compra. **Lo escribe el coordinador en
  el formulario; el backend no lo genera.** Es texto y no se puede repetir
  entre pedidos (índice único en MongoDB). Se le quitan los espacios de los
  extremos, y mayúsculas y minúsculas cuentan como distintas.
- `tipoProducto`: lista cerrada, igual que la `categoria` del proveedor. Solo
  `"construcción"` o `"general"`, en minúscula y con tilde.

El backend calcula `inicioVentana` (= `fechaHoraProgramada`) y `finVentana`
(= inicio + duración), y guarda el pedido con `estado: "PROGRAMADO"`. Si el
cliente manda esos tres campos, se ignoran. El modelo además rechaza cualquier
pedido cuya `finVentana` no sea posterior a su `inicioVentana`.

Las validaciones se hacen en este orden y la primera que falla corta:

| Respuesta | Cuándo |
|---|---|
| **400** | Falta un campo, `numeroPedido` no es texto, la fecha no es válida o la duración no es un entero mayor a 0 |
| **400** `"El tipo de producto debe ser \"construcción\" o \"general\""` | `tipoProducto` no es uno de los dos valores |
| **400** `"El proveedor indicado no existe o está inactivo"` | El `proveedorId` no existe, está dado de baja o tiene un formato inválido |
| **400** `"Ya existe un pedido con el número OC-2026-0001"` | El `numeroPedido` ya está usado en otro pedido |
| **400** `"No se puede programar un pedido en una fecha pasada"` | La ventana empieza antes del momento actual |
| **400** `"El pedido debe programarse en un día de atención (...)"` | La ventana cae en domingo (Sprint 2) |
| **400** `"El pedido debe programarse dentro del horario operativo (07:00 a 17:00)"` | La ventana no entra completa entre las 07:00 y las 17:00 |
| **409** con `alternativas` | La ventana se solapa con otro pedido que ocupa la franja |
| **201** con el pedido y el proveedor poblado | Todo correcto |

Respuesta **409**:

```json
{
  "mensaje": "La ventana horaria se solapa con otro pedido ya programado",
  "alternativas": [
    { "inicioVentana": "2026-09-21T19:00:00.000Z", "finVentana": "2026-09-21T20:00:00.000Z" },
    { "inicioVentana": "2026-09-21T20:00:00.000Z", "finVentana": "2026-09-21T21:00:00.000Z" },
    { "inicioVentana": "2026-09-21T21:00:00.000Z", "finVentana": "2026-09-21T22:00:00.000Z" }
  ]
}
```

- Las alternativas son 3 ventanas libres de la misma duración. Se buscan hacia
  adelante desde la hora pedida y, si el día no alcanza, siguen desde las 07:00
  de los días siguientes (hasta 7 días), salteando los días sin atención.
- Dos pedidos consecutivos **no** se solapan: uno de 09:00 a 10:00 y otro de
  10:00 a 11:00 se aceptan los dos.
- Un 400 por horario operativo **no** trae alternativas.

### `GET /api/pedidos`

**200** con los pedidos ordenados por `inicioVentana`. El campo `proveedorId`
viene poblado con el proveedor completo, no solo con su id:

```json
[
  {
    "_id": "6aad70236a44d650cfcbf31d",
    "numeroPedido": "OC-2026-0001",
    "proveedorId": { "_id": "6aad7047b8519521f86f6bbc", "razonSocial": "Cementos del Norte SA", "...": "..." },
    "tipoProducto": "construcción",
    "fechaHoraProgramada": "2026-09-21T15:00:00.000Z",
    "duracionEstimadaMinutos": 90,
    "inicioVentana": "2026-09-21T15:00:00.000Z",
    "finVentana": "2026-09-21T16:30:00.000Z",
    "estado": "PROGRAMADO",
    "activo": true,
    "usuarioCreacion": "Carlos Coordinador",
    "fechaCreacion": "2026-09-20T18:32:11.402Z",
    "fechaActualizacion": "2026-09-20T18:32:11.402Z"
  }
]
```

Desde el Sprint 2 devuelve **solo los pedidos activos** (salvo con
`?incluirInactivos=true`) y, antes de listar, cierra como `AUSENTE` los pedidos
vencidos que nunca registraron llegada.

### Fechas y horario operativo

- El horario de **07:00 a 17:00**, de **lunes a sábado**, se mide en la **hora
  local del servidor**. Desde el Sprint 2 se cambia en la colección
  `parametros`, no en el código.
- Conviene mandar `fechaHoraProgramada` con zona horaria
  (`2026-09-21T09:00:00-06:00`). Si llega sin zona (`2026-09-21T09:00`, que es
  lo que da un `<input type="datetime-local">`), se interpreta en la hora local
  del servidor.
- Las fechas de las respuestas vienen en ISO y en UTC (terminan en `Z`). Para
  mostrarlas en la hora local, el frontend las pasa por `new Date(...)`.
- Las altas de pedidos se procesan de a una, para que dos coordinadores no
  puedan reservar el mismo horario a la vez. Esto vale mientras el backend
  corra como un único proceso.

---

## Sprint 2 — Control de arribos, auditoría y CRUDs completos

Esta es la **parte 1 de 3** del módulo. Lo que sigue no es solo la lista de
endpoints: son las reglas que ya están implementadas y que las partes 2 y 3
tienen que respetar para que el módulo quede consistente. Si algo de acá les
estorba, **cámbienlo a propósito y avisen**, no lo salteen en silencio.

Todas las respuestas de error llevan la clave `mensaje`.

### Regla 1 — Auditoría en las tres colecciones

`proveedores`, `pedidos` y `parametros` tienen estos cinco campos. Están
definidos una sola vez en `src/models/auditoria.ts`: **una colección nueva los
suma con `...camposAuditoria()` y `opcionesAuditoria`**, no copiándolos.

| Campo | Tipo | Quién lo escribe |
|---|---|---|
| `activo` | Boolean, por defecto `true` | El DELETE lo pasa a `false`. Nunca se lee del body |
| `usuarioCreacion` | String | El backend, en el alta: nombre completo del usuario del token |
| `usuarioActualizacion` | String | El backend, en cada modificación |
| `fechaCreacion` | Date | Mongoose (`timestamps` renombrados) |
| `fechaActualizacion` | Date | Mongoose, en cada `save()` |

El **nombre** del usuario no viaja en el JWT, que solo lleva `id`, `correo` y
`rol`. En cada escritura se busca en la base con el `id` del token
(`src/services/usuarioAuditoria.ts`). No agreguen el nombre al token: el login
no se toca y, además, el nombre quedaría congelado las 24 horas que dura la
sesión. Si el usuario del token ya no está en la base, se guarda su correo,
para que la auditoría nunca quede vacía.

Ningún campo de auditoría se acepta desde el body. Mandar
`{"activo": false, "usuarioCreacion": "Otro"}` en un alta no tiene efecto.

### Regla 2 — Borrado lógico (el borrado físico está prohibido)

- **Ningún endpoint** usa `deleteOne`, `deleteMany`, `remove` ni
  `findByIdAndDelete`. El `DELETE` pasa `activo` a `false`.
  Los únicos `deleteMany` del proyecto están en los seeds, que son
  herramientas de reinicio, no parte de la API.
- **Todos los GET filtran `activo: true`** por defecto, con el helper
  `filtroActivos(req)` de `src/services/borradoLogico.ts`. Se usa el helper y
  no un filtro escrito a mano porque así el default es filtrar: si fuera
  opcional, bastaría olvidarlo en un listado para que reaparezcan las bajas.
- Para ver también los inactivos: **`?incluirInactivos=true`** en la URL.
  Cualquier otro valor filtra igual.
- Un registro inactivo **sigue reservando sus claves únicas**: no se puede
  reusar el RFC de un proveedor dado de baja ni el número de un pedido
  inactivo. Es a propósito: son identificadores del mundo real.

### Mapa de endpoints

Todos piden `Authorization: Bearer <token>`: sin token **401**, con un rol que
no corresponde **403**.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/proveedores` | Coordinador | Alta |
| `GET /api/proveedores` | Coordinador | Listado (solo activos) |
| `PUT /api/proveedores/:id` | Coordinador | Actualiza los datos |
| `DELETE /api/proveedores/:id` | Coordinador | Baja lógica |
| `POST /api/pedidos` | Coordinador | Alta con validación de agenda |
| `GET /api/pedidos` | Coordinador | Listado (solo activos, con proveedor poblado) |
| `PUT /api/pedidos/:id` | Coordinador | Actualiza número, proveedor y tipo |
| `PUT /api/pedidos/:id/reprogramar` | Coordinador | Mueve la ventana horaria |
| `PUT /api/pedidos/:id/cancelar` | Coordinador | `CANCELADO` + `activo: false` |
| `DELETE /api/pedidos/:id` | Coordinador | Baja lógica (conserva el estado) |
| `POST /api/parametros` | Administrador | Alta de un parámetro |
| `GET /api/parametros` | Administrador, Coordinador | Listado (solo activos) |
| `PUT /api/parametros/:id` | Administrador | Actualiza clave, valor o descripción |
| `DELETE /api/parametros/:id` | Administrador | Baja lógica |
| `POST /api/llegadas` | Operador, Coordinador | Registra el arribo y clasifica la puntualidad |
| `POST /api/llegadas/control-ausencias` | Coordinador, Administrador | Marca `AUSENTE` los pedidos vencidos sin llegada |

Un `:id` con formato inválido responde **400** (`"El identificador ... no es
válido"`) y uno que no existe o está inactivo, **404**.

### `parametros` — la configuración vive en la base

El horario y las tolerancias **ya no son constantes del código**. Se cargan con
`npm run seed:parametros` y se pueden cambiar por la API:

| Clave | Valor inicial | Qué controla |
|---|---|---|
| `HORA_APERTURA` | `7` | Hora en que abre el depósito (0 a 23) |
| `HORA_CIERRE` | `17` | Hora de cierre; la ventana tiene que terminar antes (1 a 24) |
| `DIAS_HABILES` | `1,2,3,4,5,6` | Días de atención, `0` = domingo … `6` = sábado |
| `TOLERANCIA_ANTICIPADO_MINUTOS` | `15` | Minutos antes del inicio a partir de los cuales la llegada es `ANTICIPADO` |
| `TOLERANCIA_TARDIO_MINUTOS` | `15` | Minutos después del inicio que siguen siendo `A TIEMPO` |
| `TOLERANCIA_AUSENTE_MINUTOS` | `60` | Minutos después del inicio a partir de los cuales el pedido es `AUSENTE` |

Cuerpo del alta: `{ "clave": "...", "valor": "...", "descripcion": "..." }`.
`clave` y `valor` son obligatorios; una clave repetida da **409**.

- **La `clave` se guarda en mayúsculas.** Así `hora_apertura` y `HORA_APERTURA`
  no conviven como dos parámetros distintos que dicen lo mismo.
- **El `valor` es siempre texto**, aunque el contenido sea un número: es una
  tabla genérica y cada módulo interpreta lo suyo. `DIAS_HABILES` usa una
  lista separada por comas por el mismo motivo.
- **Si falta un parámetro, el backend usa su valor por defecto y avisa por
  consola**; no se cae. Dar de baja una fila de configuración no puede dejar
  el sistema entero sin operar.
- Valores imposibles se descartan: un cierre anterior o igual a la apertura
  (dejaría el depósito sin ninguna franja válida) y un límite de ausencia
  menor o igual al margen tardío (borraría el estado `TARDÍO` entero).
- La configuración se **cachea 60 segundos** y el caché se borra al escribir
  cualquier parámetro, así que un cambio por la API se aplica en el acto.

Para leerla desde el código: `obtenerConfiguracionOperativa()` de
`src/services/configuracionOperativa.ts`. **No consulten la colección
`parametros` por su cuenta** desde otro servicio.

### Horario operativo y días de atención

- **07:00 a 17:00, de lunes a sábado**, medido en la **hora local del
  servidor**. Se cambia en `parametros`, no en el código.
- El domingo tiene su propio error, y se responde **antes** que el de horario:
  `"El pedido debe programarse en un día de atención (lunes, martes,
  miércoles, jueves, viernes y sábado)"`. Decirle "fuera del horario 07:00 a
  17:00" a quien programó un domingo a las 09:00 lo deja mirando el reloj en
  lugar del calendario.
- Las **alternativas del 409 saltean los días no hábiles**: si el sábado no
  queda lugar, la siguiente ventana que se ofrece es del lunes.
- `src/services/ventanaHoraria.ts` **no toca la base**: recibe el horario como
  argumento. Si necesitan una función nueva de fechas, va ahí y sigue la misma
  regla, así se puede probar sin levantar Mongo.

### Estados del pedido

| Estado | Lo provoca | ¿Ocupa la franja? |
|---|---|---|
| `PROGRAMADO` | El alta, y la reprogramación | Sí |
| `ANTICIPADO` | `POST /api/llegadas` | Sí |
| `A TIEMPO` | `POST /api/llegadas` | Sí |
| `TARDÍO` | `POST /api/llegadas` | Sí |
| `AUSENTE` | El control de ausencias, o una llegada pasadísima | No |
| `CANCELADO` | `PUT /api/pedidos/:id/cancelar` | No |

Los textos van **exactos**: `A TIEMPO` con espacio y `TARDÍO` con tilde. El
frontend compara el texto tal cual.

**Cuáles ocupan la franja importa.** La constante
`ESTADOS_QUE_OCUPAN_FRANJA` (en `src/models/Pedido.ts`) es la que usa el
control de solapamiento. Un pedido que ya llegó sigue ocupando su horario: si
se filtrara solo por `PROGRAMADO`, se podría programar otra entrega encima de
un camión que está descargando. `CANCELADO` y `AUSENTE` sí liberan el andén.
**Si agregan un estado, decidan en qué lado de esa lista va.**

### Cambios en los endpoints del Sprint 1

| Antes | Ahora |
|---|---|
| `POST /api/pedidos` aceptaba cualquier proveedor existente | El proveedor tiene que estar **activo**; si no, **400** `"El proveedor indicado no existe o está inactivo"` |
| El solapamiento se medía contra los pedidos `PROGRAMADO` | Se mide contra `ESTADOS_QUE_OCUPAN_FRANJA` y solo los `activo: true` |
| No había regla de días | El domingo se rechaza con **400** |
| Los `GET` devolvían todo | Devuelven solo los activos |
| El horario estaba en una constante del código | Sale de `parametros` |
| Las respuestas no traían auditoría | Traen `activo` y los cuatro campos de auditoría |

`GET /api/pedidos` además **corre el control de ausencias antes de listar**
(ver más abajo), así que puede cambiar estados como efecto de una lectura.

### `PUT /api/proveedores/:id` y `DELETE /api/proveedores/:id`

El `PUT` toca solo los campos que vengan en el body y valida lo mismo que el
alta (categoría de la lista cerrada, formato del email, RFC único → **409**).

El `DELETE` **no cancela las entregas ya programadas del proveedor**: son dos
decisiones distintas y cancelar pedidos por detrás sería una sorpresa. Pero
tampoco se calla: si quedan pedidos futuros, la respuesta trae una
`advertencia`.

```json
{
  "mensaje": "Proveedor inactivado",
  "advertencia": "El proveedor tiene 1 pedido(s) programado(s) a futuro. Conviene cancelarlos o reprogramarlos con otro proveedor.",
  "proveedor": { "activo": false, "...": "..." }
}
```

### `PUT /api/pedidos/:id` — datos administrativos

Acepta `numeroPedido`, `proveedorId` y `tipoProducto`. **La ventana horaria no
se cambia acá**, sino con `/reprogramar`: mover el horario obliga a revalidar
día, horario y solapamiento, y mezclar las dos cosas haría que un cambio de
proveedor pudiera devolver un 409 por choque de agenda.

El número duplicado da **400**, pero mandar el número que el pedido **ya
tiene** es válido: el pedido no choca consigo mismo.

### `PUT /api/pedidos/:id/reprogramar`

```json
{ "fechaHoraProgramada": "2026-10-05T14:00:00-06:00", "duracionEstimadaMinutos": 90 }
```

`fechaHoraProgramada` es obligatoria; si no mandan `duracionEstimadaMinutos`,
se conserva la que tenía.

| Respuesta | Cuándo |
|---|---|
| **200** `{ "mensaje": "Pedido reprogramado", "pedido": {...} }` | Todo correcto |
| **400** | Falta la fecha, es inválida, la duración no es un entero > 0, la fecha es pasada, cae en domingo o sale del horario |
| **400** `"No se puede reprogramar un pedido en estado ..."` | El pedido ya registró llegada (`ANTICIPADO`, `A TIEMPO`, `TARDÍO`) |
| **404** | No existe o está inactivo |
| **409** con `alternativas` | Choca con otro pedido |

Dos detalles: **el pedido no choca consigo mismo** (reprogramarlo a su misma
hora devuelve 200), y un `AUSENTE` **sí** se puede reprogramar — vuelve a
`PROGRAMADO` y se borra su `fechaHoraLlegadaReal`, porque reprogramar un
ausente es darle una cita nueva.

### `PUT /api/pedidos/:id/cancelar` y `DELETE /api/pedidos/:id`

| | `cancelar` | `DELETE` |
|---|---|---|
| `estado` | pasa a `CANCELADO` | queda como estaba |
| `activo` | `false` | `false` |
| Libera la franja | Sí | Sí |

La diferencia es el rastro: cancelar deja escrito **por qué** esa entrega ya no
cuenta. Un pedido que ya registró llegada **no se puede cancelar** (**400**):
el reporte de arribos perdería un camión que efectivamente llegó.

### `POST /api/llegadas` — el control de arribos (HU-02)

```json
{ "numeroPedido": "OC-2026-0011" }
```

o bien `{ "pedidoId": "6ab8a02104386103ae595a1f" }`. Se aceptan las dos formas:
en el andén se trabaja con el código de la orden, que es lo que viene en el
remito, y el frontend ya tiene el `_id` del pedido que está mostrando.

**La hora de llegada la pone el servidor, nunca el body.** Si viniera del
cliente, cualquiera podría "llegar a tiempo" mandando otra hora.

Con esa hora, el `inicioVentana` del pedido y las tolerancias de `parametros`
se clasifica la puntualidad. Con los valores iniciales (15 / 15 / 60) y una
ventana que empieza a las **09:00**:

| Llegada | Estado |
|---|---|
| hasta 08:44 | `ANTICIPADO` |
| 08:45 a 09:15 | `A TIEMPO` |
| 09:16 a 10:00 | `TARDÍO` |
| 10:01 en adelante | `AUSENTE` |

Los bordes **cuentan a favor del proveedor**: llegar exactamente 15 minutos
tarde todavía es `A TIEMPO`.

Respuesta **200**:

```json
{
  "mensaje": "Llegada registrada: A TIEMPO",
  "clasificacion": {
    "estado": "A TIEMPO",
    "minutosDeDiferencia": -5,
    "inicioVentana": "2026-09-28T15:00:00.000Z",
    "limiteDeAusencia": "2026-09-28T16:00:00.000Z",
    "tolerancias": { "anticipadoMinutos": 15, "tardioMinutos": 15, "ausenteMinutos": 60 }
  },
  "pedido": { "estado": "A TIEMPO", "fechaHoraLlegadaReal": "2026-09-28T14:55:00.000Z", "...": "..." }
}
```

`minutosDeDiferencia` es negativo si llegó antes de la hora y positivo si
llegó después. Va en la respuesta para que el frontend pueda explicar el
estado **sin recalcular nada ni conocer los márgenes**.

| Respuesta | Cuándo |
|---|---|
| **400** | No vino `pedidoId` ni `numeroPedido`, o el id tiene formato inválido |
| **404** | El pedido no existe, está cancelado o inactivo |
| **409** `"El pedido ya registró su llegada"` | Ya tiene `fechaHoraLlegadaReal` |
| **200** | Llegada registrada, con el pedido y el proveedor poblado |

La llegada se registra **una sola vez**: sobrescribirla borraría justamente el
dato que se audita.

### El pedido que nunca registra llegada

`AUSENTE` es el único estado que **no lo dispara ninguna acción de nadie**.
Programar, registrar la llegada y cancelar los provoca una persona; "no vino
nadie" es la *ausencia* de un evento, y en ese momento no hay nada que ejecutar.

Se resolvió con **marcado perezoso**, en `src/services/controlAusencias.ts`:

1. Corre **al listar pedidos** (`GET /api/pedidos`), con un solo `updateMany`
   sobre los pedidos activos, en `PROGRAMADO`, sin `fechaHoraLlegadaReal` y
   con `inicioVentana` anterior al límite.
2. Se puede disparar a mano con **`POST /api/llegadas/control-ausencias`**, que
   responde `{ "pedidosMarcados": 1, "limiteEnMinutos": 60 }`.

No hay ningún proceso de fondo (ni `setInterval`, ni cron propio): con dos
instancias del backend levantadas, las dos marcarían. La consecuencia honesta
es que un pedido **"se convierte" en `AUSENTE` cuando alguien mira la lista**,
no en el minuto exacto del vencimiento. No se pierde información, porque el
estado se deduce de `inicioVentana` y del margen: lo que ve el usuario siempre
está al día.

Si más adelante hace falta el instante justo, alcanza con que el Programador de
tareas de Windows o un cron le pegue al endpoint cada pocos minutos: la
operación es **idempotente** (correrla dos veces marca 0 la segunda) y **no
toca los pedidos que ya registraron llegada**.

Así la auditoría distingue dos cosas distintas que comparten estado:

| | `estado` | `fechaHoraLlegadaReal` | `usuarioActualizacion` |
|---|---|---|---|
| Nunca vino | `AUSENTE` | vacío | `Sistema (control de ausencias)` |
| Vino muy tarde | `AUSENTE` | la hora real | el nombre del operador |

---

## Para las partes 2 y 3

Lo que conviene respetar, y dónde está cada cosa.

**Si agregan una colección nueva:** modelo con `...camposAuditoria()` y
`opcionesAuditoria`, nombre de la colección explícito como tercer argumento de
`mongoose.model` (sin eso, Mongoose pluraliza en inglés: `proveedors`),
`filtroActivos(req)` en el listado, `nombreDelUsuario(req)` en cada escritura,
`DELETE` que solo pasa `activo` a `false`, y los errores por
`respondioErrorDeEscritura` / `respondioIdInvalido` de
`src/services/respuestasError.ts`.

**Si agregan un parámetro de configuración:** la clave va en
`CLAVES_PARAMETROS`, el valor inicial en `src/scripts/seedParametros.ts`, y la
lectura y validación en `obtenerConfiguracionOperativa()`, con su valor por
defecto. El código nunca escribe la clave como cadena suelta.

**Si agregan un estado de pedido:** va en `ESTADOS_PEDIDO` y hay que decidir si
entra o no en `ESTADOS_QUE_OCUPAN_FRANJA`. Si el texto lleva tilde, ya está
cubierto por `normalizarNFC`.

**Dos cosas que conviene no tocar sin entenderlas primero:**

- **El orden de validación del alta de pedidos** está documentado arriba de
  `crearPedido`. Está pensado para que el mensaje de error hable del problema
  real y no del siguiente que aparezca.
- **La cola de altas** (`ejecutarEnSerie`, en `pedidoController.ts`): revisar
  el solapamiento y guardar son dos pasos con un `await` en el medio. Sin la
  cola, dos coordinadores pueden reservar el mismo horario a la vez. Vale
  mientras el backend corra como **un único proceso**; con varias instancias
  hay que pasar a una transacción de MongoDB.

**Decisiones que tomé yo y se pueden cambiar** (son una línea cada una, pero
cámbienlas a propósito):

| Decisión | Dónde |
|---|---|
| Escribir parámetros es solo del Administrador; el Coordinador solo lee | `routes/parametroRoutes.ts` |
| Registrar llegadas es del Operador y del Coordinador | `routes/llegadaRoutes.ts` |
| Dar de baja un proveedor avisa de sus pedidos futuros, pero no los cancela | `inactivarProveedor` |
| El caché de configuración dura 60 segundos | `SEGUNDOS_DE_CACHE` |
| Los bordes de las tolerancias cuentan a favor del proveedor | `services/puntualidad.ts` |

**Deuda conocida, por si le toca a alguno:**

- Los pedidos guardados antes del Sprint 2 no tienen los campos de auditoría:
  hay que correr `npm run seed:demo` después de bajar estos cambios.
- No hay framework de pruebas instalado. Todo se verificó con scripts `fetch`
  contra la API real y una base aparte; si van a meter `jest`, mejor hacerlo
  ahora que en la parte 3.
- Los feriados no existen: para el backend son días hábiles como cualquier otro.

---

## Demo del módulo

Se muestran cuatro casos: registrar un proveedor, crear un pedido válido,
provocar un rechazo por solapamiento con alternativas y registrar las llegadas
con sus cuatro clasificaciones de puntualidad.

### Antes de la demo

1. **Comprobar que el login funciona.** Hacer `POST /api/auth/login` con
   `coordinador@logistica.com` / `Coord123`. Si responde **401 "Credenciales
   inválidas"**, los usuarios de esa base tienen otras contraseñas: correr
   `npm run seed`, que los borra y los recrea con las contraseñas de la tabla
   de usuarios de prueba. Cada integrante tiene su propia base local, así que
   esto solo afecta a la base de quien lo corre.
2. **Cargar los parámetros de operación** (una sola vez alcanza, no hace falta
   repetirlo en cada demo):

   ```bash
   npm run seed:parametros
   ```

   Sin esto el backend funciona igual, con sus valores por defecto, pero avisa
   por consola en cada petición y no se pueden mostrar los parámetros por la API.

3. **El mismo día de la demo, antes de empezar,** correr:

   ```bash
   npm run seed:demo
   ```

   Limpia proveedores y pedidos (nunca usuarios ni parámetros) y carga:
   - 3 proveedores: uno de `construcción` y dos de `general`;
   - 1 pedido **bloqueador** `PROGRAMADO`, número `OC-2026-0001`, de **09:00 a 10:00** (60 minutos),
     el **próximo día de atención** a partir de mañana: solo se saltea el
     domingo, porque el depósito atiende de lunes a sábado;
   - 4 pedidos para el **control de arribos**, `OC-2026-0010` a `OC-2026-0013`,
     con la ventana ubicada en relación a la hora en que se corre el seed, para
     que cada llegada caiga siempre en la misma clasificación.
4. **Anotar lo que imprime.** La fecha del bloqueador se calcula en cada
   corrida, así que los IDs y las fechas cambian. Usar siempre los de la
   última corrida. Salida de ejemplo:

   ```
   [Seed demo] Proveedores creados: 3
     - 6aad77af7a4b5e8c974caf86  construcción  Cementos y Agregados del Valle S.A. de C.V.
     - 6aad77af7a4b5e8c974caf87  general       Distribuidora Comercial Altamira S.A. de C.V.
     - 6aad77af7a4b5e8c974caf88  general       Suministros Industriales Norteños S. de R.L. de C.V.
   [Seed demo] Pedido bloqueador creado:
     - numero:    OC-2026-0001
     - dia:       lunes, 28 de septiembre de 2026
     - horario:   09:00 a 10:00 (60 min, PROGRAMADO)
   [Seed demo] Pedidos para el control de arribos: 4 (proveedor Distribuidora Comercial Altamira S.A. de C.V.)
   [Seed demo] Tolerancias vigentes: 15 min antes, 15 min despues, limite de ausencia 60 min.
     - OC-2026-0010  ventana 00:03 a 00:33  ->  ANTICIPADO (registrar la llegada ahora)
     - OC-2026-0011  ventana 22:53 a 23:23  ->  A TIEMPO   (registrar la llegada ahora)
     - OC-2026-0012  ventana 22:18 a 22:48  ->  TARDÍO     (registrar la llegada ahora)
     - OC-2026-0013  ventana 21:18 a 21:48  ->  AUSENTE    (POST /api/llegadas/control-ausencias o un GET /api/pedidos)
   [Seed demo] Para la demo (POST /api/pedidos, 60 min):
     - pedido valido -> "numeroPedido": "OC-2026-0002", "fechaHoraProgramada": "2026-09-28T11:00:00-06:00"
     - solapamiento  -> "numeroPedido": "OC-2026-0003", "fechaHoraProgramada": "2026-09-28T09:30:00-06:00"
   [Seed demo] Para la demo de arribos (POST /api/llegadas, rol Operador):
     - { "numeroPedido": "OC-2026-0010" }  ->  ANTICIPADO
     - { "numeroPedido": "OC-2026-0011" }  ->  A TIEMPO
     - { "numeroPedido": "OC-2026-0012" }  ->  TARDÍO
     - OC-2026-0013 queda sin llegada: POST /api/llegadas/control-ausencias -> AUSENTE
   ```

5. Levantar el servidor con `npm run dev` e iniciar sesión como Coordinador
   (y como Operador, para el caso 4). Todas las peticiones llevan
   `Authorization: Bearer <token>`.

### Los casos

**1. Registrar un proveedor** → `POST /api/proveedores` → **201**

```json
{
  "razonSocial": "Ferretería y Materiales San Ángel S.A. de C.V.",
  "identificacionTributaria": "FMS090311QW4",
  "categoria": "construcción",
  "contactoNombre": "Ricardo Salinas Mora",
  "telefono": "+52 55 5550 1234",
  "emailContacto": "pedidos@ferresanangel.com.mx"
}
```

Si se repite la misma `identificacionTributaria`, responde 409. Para
registrarlo de nuevo, volver a correr `npm run seed:demo`.

**2. Crear un pedido válido** → `POST /api/pedidos` → **201**

Usar un `proveedorId` de la salida del seed y los datos de "pedido valido":

```json
{
  "numeroPedido": "OC-2026-0002",
  "proveedorId": "<id de un proveedor del seed>",
  "tipoProducto": "general",
  "fechaHoraProgramada": "<fecha de 'pedido valido'>",
  "duracionEstimadaMinutos": 60
}
```

**3. Rechazo por solapamiento** → `POST /api/pedidos` → **409**

El mismo body, pero con los datos de "solapamiento": otro `numeroPedido`
(`OC-2026-0003`) y la hora 09:30, que choca con el bloqueador de 09:00 a
10:00. Hay que cambiar el número: si se repite uno ya usado, el backend
responde 400 por número duplicado antes de revisar el horario. La respuesta
trae `mensaje` y 3 `alternativas` libres. Si ya se hizo el caso 2 a las 11:00, las alternativas se saltean ese
horario: 10:00, 12:00 y 13:00.

**4. Control de arribos** → `POST /api/llegadas` → **200**

Con el token del **Operador** (`operador@logistica.com` / `Oper123`), y usando
los números que imprimió el seed:

```json
{ "numeroPedido": "OC-2026-0011" }
```

| Body | Estado que devuelve |
|---|---|
| `{ "numeroPedido": "OC-2026-0010" }` | `ANTICIPADO` |
| `{ "numeroPedido": "OC-2026-0011" }` | `A TIEMPO` |
| `{ "numeroPedido": "OC-2026-0012" }` | `TARDÍO` |

Repetir cualquiera de los tres devuelve **409**: la llegada se registra una
sola vez.

`OC-2026-0013` se deja sin registrar a propósito: con el token del
**Coordinador**, `POST /api/llegadas/control-ausencias` lo marca `AUSENTE` y
responde cuántos pedidos cerró. Un `GET /api/pedidos` hace lo mismo.

Para mostrar que la configuración es de verdad configurable: con el token del
**Administrador**, `GET /api/parametros`, y un `PUT` que cambie
`TOLERANCIA_TARDIO_MINUTOS` a `0` hace que la próxima llegada con un minuto de
atraso ya salga `TARDÍO`.

### Tener en cuenta

- Después de bajar este cambio, correr `npm run seed:demo` aunque ya se haya
  corrido antes. Los pedidos cargados con versiones anteriores no tienen
  `numeroPedido` y tienen un `tipoProducto` que ya no es válido.
- Los feriados no se contemplan: el seed los trata como días hábiles (por
  ejemplo, el 1 de enero).
- Las fechas de las respuestas vienen en UTC (terminan en `Z`): 15:00Z son las
  09:00 en la hora de México (UTC-6).
- Ensayar antes ensucia la base. Correr `npm run seed:demo` otra vez justo
  antes de la demo para arrancar limpios. Los pedidos de arribo se recalculan
  en cada corrida, así que **ensayar las llegadas obliga a volver a sembrar**:
  una vez registradas, devuelven 409.
- Las ventanas de los pedidos de arribo pueden caer fuera del horario operativo
  o en domingo, porque se calculan a partir del reloj. Es a propósito: son datos
  insertados por el seed, no pedidos programados desde la API.

---

## Estructura

```
backend/
├── src/
│   ├── config/database.ts            → conexión con Mongoose
│   ├── controllers/
│   │   ├── authController.ts         → lógica del login
│   │   ├── proveedorController.ts    → CRUD de proveedores (con baja lógica)
│   │   ├── pedidoController.ts       → CRUD de pedidos, reprogramar y cancelar
│   │   ├── parametroController.ts    → CRUD de la configuración del sistema
│   │   └── llegadaController.ts      → registro de arribos y control de ausencias
│   ├── middlewares/
│   │   ├── verificarToken.ts         → valida la firma del JWT (401)
│   │   └── autorizarRoles.ts         → compara el rol del token (403)
│   ├── models/
│   │   ├── auditoria.ts              → los 5 campos de auditoría, compartidos
│   │   ├── Usuario.ts                → esquema + hash bcrypt + comparación
│   │   ├── Proveedor.ts              → esquema del proveedor (colección proveedores)
│   │   ├── Pedido.ts                 → esquema del pedido, estados y referencia a Proveedor
│   │   └── Parametro.ts              → configuración del sistema (clave/valor)
│   ├── routes/
│   │   ├── authRoutes.ts             → rutas de /api/auth
│   │   ├── proveedorRoutes.ts        → rutas de /api/proveedores
│   │   ├── pedidoRoutes.ts           → rutas de /api/pedidos
│   │   ├── parametroRoutes.ts        → rutas de /api/parametros
│   │   └── llegadaRoutes.ts          → rutas de /api/llegadas
│   ├── services/
│   │   ├── ventanaHoraria.ts         → solapamiento, huecos libres y alternativas (puro)
│   │   ├── puntualidad.ts            → clasificación de la llegada (puro)
│   │   ├── configuracionOperativa.ts → lee el horario y las tolerancias de parametros
│   │   ├── controlAusencias.ts       → marca AUSENTE los pedidos vencidos sin llegada
│   │   ├── borradoLogico.ts          → filtro de activos de los listados
│   │   ├── usuarioAuditoria.ts       → nombre del usuario para la auditoría
│   │   └── respuestasError.ts        → traduce los errores de Mongoose y valida el :id
│   ├── scripts/
│   │   ├── seed.ts                   → carga los usuarios de prueba
│   │   ├── seedParametros.ts         → carga el horario operativo y las tolerancias
│   │   └── seedDemo.ts               → carga proveedores y los pedidos de la demo
│   ├── types/                        → tipos del payload y del Request
│   └── server.ts                     → Express, CORS y arranque
├── .env.example
└── tsconfig.json
```

---

## Notas del equipo

- **Roles:** siempre con mayúscula inicial — `Administrador`, `Coordinador`,
  `Operador`. JavaScript distingue mayúsculas, así que `"operador"` rompería la
  redirección del frontend sin lanzar ningún error.
- **CORS:** habilitado solo para `http://localhost:3000`, que es donde corre el
  frontend. Si alguien cambia el puerto del frontend, hay que agregar
  `FRONTEND_URL` al `.env` con la nueva URL.
- **TypeScript 5.9:** no subir a la 7. `ts-node-dev` no funciona con esa
  versión y el `npm run dev` deja de arrancar.
- **Textos de los enums:** van exactos, en minúscula y con tilde los de
  `categoria` y `tipoProducto` (`"construcción"`), y en mayúscula los estados
  (`"A TIEMPO"` con espacio, `"TARDÍO"` con tilde). El frontend compara el
  texto tal cual.
- **Nunca borrar registros.** El `DELETE` de la API es baja lógica. Si una
  prueba necesita la base limpia, se corren los seeds, no un `deleteMany` a
  mano desde un endpoint.
- **En Windows, cortar `npm run dev` no siempre mata a `ts-node-dev`:** el
  servidor viejo sigue ocupando el puerto y las pruebas terminan pegándole a
  otra base. Si algo no cuadra, revisar en el log a qué base se conectó.
