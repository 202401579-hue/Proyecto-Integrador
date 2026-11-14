# Seguridad y factibilidad — SumaControl

Evidencia del Informe Técnico "Análisis de Riesgos, Controles de Seguridad y Estudio de Factibilidad de SumaControl" (Grupo N.º 1, Sección 1-1, MDS 0, ciclo 2-2026).

## Contenido

| Ruta | Qué contiene |
|---|---|
| `Analisis_Riesgos_Factibilidad_Grupo1.pdf` | Informe técnico completo (17 páginas) |
| `evidencia-controles/matriz-riesgos-controles.md` | 10 riesgos valorados (P×I) y 16 controles con su estado real |
| `evidencia-controles/resultado-pruebas-jest.log` | Ejecución de las pruebas de seguridad del backend: 4 suites, 40 pruebas aprobadas (rama develop, commit 17699ba) |
| `seccion-1/` | Sección 1 del Documento Maestro: Project Charter, Ishikawa y BPMN |
| `diagramas/` | Imágenes (mapa de riesgos, Ishikawa, BPMN) y los scripts que las generan |

## Dónde está cada control en el código

| Control | Archivos |
|---|---|
| JWT (ACCESS / MFA_TEMP) | `backend/src/services/tokens.ts`, `middlewares/verificarToken.ts` |
| RBAC dinámico | `backend/src/middlewares/checkPermission.ts`, `services/permisos.ts`, `services/roles.ts` |
| bcrypt | `backend/src/models/Usuario.ts`, `services/intentosMfa.ts` |
| Validación y sanitización de entrada | `controllers/authController.ts`, `controllers/eventoController.ts`, `docs/arquitectura-y-datos/schema.js` |
| Secretos y CORS | `.gitignore`, `.env.example`, `backend/src/server.ts` |

## Estado de los controles

Vigentes: C-01 a C-06, C-08, C-09, C-11. Parciales: C-07, C-10. Propuestos (no implementados): C-12 HTTPS/TLS, C-13 límite de intentos y cabeceras, C-14 sanitizeFilter, C-15 respaldos, C-16 cookie httpOnly/CSP.

## Limitaciones

- Las pruebas funcionales de RBAC (`backend/src/pruebas/casos-rbac.ts`) requieren base de datos y no se ejecutaron para este informe.
- Las cifras económicas son estimaciones con supuestos declarados.
