# Matriz de riesgos y controles — SumaControl

Valoración P (1–5) × I (1–5). Niveles: Bajo 1–4, Medio 5–9, Alto 10–14, Crítico 15–25.

| ID | Amenaza | P×I actual | Nivel | Controles | Residual |
|---|---|---|---|---|---|
| R-01 | Fuerza bruta o relleno de credenciales sobre el inicio de sesión | 3×4=12 | Alto | C-02, C-03, C-04 (vigentes); C-13 y MFA obligatorio al Administrador (propuestos) | 8 (Medio) |
| R-02 | Robo o reutilización del token de sesión | 3×4=12 | Alto | C-01, C-05 (vigentes); C-13 y C-16 (propuestos) | 6 (Medio) |
| R-03 | Inyección NoSQL o datos maliciosos en el cuerpo de la petición | 2×4=8 | Medio | C-07 (parcial); C-14 (propuesto) | 4 (Bajo) |
| R-04 | Escalamiento de privilegios por RBAC mal configurado | 2×4=8 | Medio | C-05, C-06 (vigentes); permisos por acción (propuesto) | 6 (Medio) |
| R-05 | Intercepción de credenciales y tokens en tránsito | 3×5=15 | Crítico | C-08 (vigente, no cubre este riesgo); C-12 (propuesto) | 5 (Medio) |
| R-06 | Filtración o debilidad de los secretos de configuración | 2×5=10 | Alto | C-09 (vigente); secreto robusto y MongoDB autenticado (propuestos) | 5 (Medio) |
| R-07 | Compromiso de la base de datos con secretos TOTP legibles | 2×4=8 | Medio | C-02, C-03 (vigentes); cifrado del secreto TOTP (propuesto) | 4 (Bajo) |
| R-08 | Repudio y falta de trazabilidad de los eventos de seguridad | 3×3=9 | Medio | C-10 (parcial); eventos de autenticación (propuesto) | 4 (Bajo) |
| R-09 | Denegación de servicio por agotamiento de recursos | 3×3=9 | Medio | C-13 (propuesto); límites del proxy inverso | 4 (Bajo) |
| R-10 | Pérdida o corrupción de datos operativos | 2×5=10 | Alto | C-10, C-11 (vigentes); C-15 (propuesto) | 5 (Medio) |

## Controles

| ID | Control | Estado | Evidencia |
|---|---|---|---|
| C-01 | Autenticación JWT con dos tipos de token (ACCESS 8 h; MFA_TEMP 5 min con jti aleatorio) | R-02 | Vigente |
| C-02 | Hash de contraseñas con bcrypt (salt, 10 rondas, versión asíncrona, select: false) | R-01, R-07 | Vigente |
| C-03 | Segundo factor TOTP, códigos de recuperación hasheados y límite de 5 intentos por token | R-01, R-07 | Vigente |
| C-04 | Respuesta genérica en el login ("Credenciales inválidas"); la baja se verifica después de la clave | R-01 | Vigente |
| C-05 | RBAC dinámico: checkPermission reconsulta usuario y roles activos en cada petición | R-02, R-04 | Vigente |
| C-06 | Administrador protegido y autoprotección (no modifica sus roles ni se da de baja: 409) | R-04 | Vigente |
| C-07 | Validación y coerción de entrada: String(), tipos, ObjectId.isValid, validadores Mongoose y $jsonSchema | R-03 | Parcial |
| C-08 | CORS restringido al origen configurado (FRONTEND_URL) | R-03 | Vigente |
| C-09 | Secretos por variables de entorno; .env fuera del repositorio; la autenticación falla con 500 si falta JWT_SECRET | R-06 | Vigente |
| C-10 | Bitácora de solo inserción (los middlewares del modelo bloquean update, replace y delete) | R-08, R-10 | Parcial |
| C-11 | Baja lógica: no se borran documentos y las consultas filtran por activo | R-10 | Vigente |
| C-12 | HTTPS/TLS con proxy inverso, certificado y cabecera HSTS | R-05 | Propuesto |
| C-13 | Límite de intentos en el login, límite general de peticiones y cabeceras seguras (helmet) | R-01, R-02, R-09 | Propuesto |
| C-14 | Sanitización global de filtros (sanitizeFilter de Mongoose) y validación de esquema de entrada | R-03 | Propuesto |
| C-15 | Respaldos automáticos con mongodump y prueba mensual de restauración | R-10 | Propuesto |
| C-16 | Sesión en el navegador: cookie httpOnly o token en memoria y política CSP | R-02 | Propuesto |
