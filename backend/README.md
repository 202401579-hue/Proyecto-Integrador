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

`categoria` acepta solo `"construcción"` o `"general"`, en minúscula y con tilde.

### `GET /api/proveedores`

**200** con el arreglo de proveedores, ordenado por razón social.

### `POST /api/pedidos`

```json
{
  "proveedorId": "6aad7047b8519521f86f6bbc",
  "tipoProducto": "Cemento",
  "fechaHoraProgramada": "2026-09-21T09:00:00-06:00",
  "duracionEstimadaMinutos": 90
}
```

El backend calcula `inicioVentana` (= `fechaHoraProgramada`) y `finVentana`
(= inicio + duración), y guarda el pedido con `estado: "PROGRAMADO"`. Si el
cliente manda esos tres campos, se ignoran.

Las validaciones se hacen en este orden y la primera que falla corta:

| Respuesta | Cuándo |
|---|---|
| **400** | Falta un campo, la fecha no es válida o la duración no es un entero mayor a 0 |
| **400** `"El proveedor indicado no existe"` | El `proveedorId` no existe o tiene un formato inválido |
| **400** `"No se puede programar un pedido en una fecha pasada"` | La ventana empieza antes del momento actual |
| **400** `"El pedido debe programarse dentro del horario operativo (07:00 a 17:00)"` | La ventana no entra completa entre las 07:00 y las 17:00 |
| **409** con `alternativas` | La ventana se solapa con otro pedido `PROGRAMADO` |
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
  de los días siguientes (hasta 7 días).
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
    "proveedorId": { "_id": "6aad7047b8519521f86f6bbc", "razonSocial": "Cementos del Norte SA", "...": "..." },
    "tipoProducto": "Cemento",
    "fechaHoraProgramada": "2026-09-21T15:00:00.000Z",
    "duracionEstimadaMinutos": 90,
    "inicioVentana": "2026-09-21T15:00:00.000Z",
    "finVentana": "2026-09-21T16:30:00.000Z",
    "estado": "PROGRAMADO"
  }
]
```

### Fechas y horario operativo

- El horario de **07:00 a 17:00** se mide en la **hora local del servidor**.
  Se cambia en `HORARIO_OPERATIVO`, dentro de `src/services/ventanaHoraria.ts`.
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

## Estructura

```
backend/
├── src/
│   ├── config/database.ts            → conexión con Mongoose
│   ├── controllers/
│   │   ├── authController.ts         → lógica del login
│   │   ├── proveedorController.ts    → alta y listado de proveedores
│   │   └── pedidoController.ts       → alta (validaciones + solape) y listado de pedidos
│   ├── middlewares/
│   │   ├── verificarToken.ts         → valida la firma del JWT (401)
│   │   └── autorizarRoles.ts         → compara el rol del token (403)
│   ├── models/
│   │   ├── Usuario.ts                → esquema + hash bcrypt + comparación
│   │   ├── Proveedor.ts              → esquema del proveedor (colección proveedores)
│   │   └── Pedido.ts                 → esquema del pedido, referencia a Proveedor
│   ├── routes/
│   │   ├── authRoutes.ts             → rutas de /api/auth
│   │   ├── proveedorRoutes.ts        → rutas de /api/proveedores
│   │   └── pedidoRoutes.ts           → rutas de /api/pedidos
│   ├── services/ventanaHoraria.ts    → solapamiento, huecos libres y alternativas
│   ├── scripts/seed.ts               → carga los usuarios de prueba
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
