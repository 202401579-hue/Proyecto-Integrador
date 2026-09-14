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

## Estructura

```
backend/
├── src/
│   ├── config/database.ts            → conexión con Mongoose
│   ├── controllers/authController.ts → lógica del login
│   ├── middlewares/
│   │   ├── verificarToken.ts         → valida la firma del JWT (401)
│   │   └── autorizarRoles.ts         → compara el rol del token (403)
│   ├── models/Usuario.ts             → esquema + hash bcrypt + comparación
│   ├── routes/authRoutes.ts          → rutas de /api/auth
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
