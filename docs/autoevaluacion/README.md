# Autoevaluación del Proyecto Integrador — SumaControl

Evidencias de la Ficha de Autoevaluación (Grupo N.º 1, Sección 1-1, MDS 0, ciclo 2-2026). Cubre las Secciones 7 y 9 del Documento Maestro.

| Archivo | Sección | Contenido |
|---|---|---|
| `Ficha_Autoevaluacion_Equipo1.pdf` | — | Ficha completa (3 bloques) |
| `matriz-qa-vigente.md` | 7 | Matriz PASS/FAIL: 14 suites unitarias (139 casos) y 21 casos funcionales CP/PI, con reglas y HU |
| `resultado-funcional.log` | 7 | Salida completa de `npm run test:funcional` (21 de 21 PASS, 21 de noviembre de 2026) |
| `resultado-jest.log` | 7 | Salida completa de `npx jest --verbose --coverage` sobre `develop` |
| `SumaControl_API.postman_collection.json` | 9 | Colección Postman con 27 solicitudes de los 13 módulos de la API; cada una verifica tiempo < 200 ms |
| `SumaControl_API_solo_lectura.postman_collection.json` | 9 | Versión segura: solo login y GET, sin crear ni modificar datos; se ejecuta completa |
| `resultado-postman.txt` | 9 | Salida de newman sobre `develop`: 13 de 13 solicitudes en 200, 0 fallos, 17 ms de promedio (máx. 97 ms) |
| `evidencia-servidor.txt` | — | Salidas del servidor Linux de GSO 0 (sistema, recursos, MongoDB, arranques y cron) |

## Otros artefactos ya versionados

| Artefacto | Ruta |
|---|---|
| Plan de QA (casos CP/PI, Sprint 5) | `docs/entregables/Plan_Pruebas_QA_Grupo1.pdf` |
| Script de esquema de la base (MongoDB, equivalente NoSQL de schema.sql) | `docs/arquitectura-y-datos/schema.js` |
| Análisis de riesgos y controles | `docs/seguridad-y-factibilidad/` |
| Banco de pruebas funcionales | `backend/src/pruebas/` |

## Cómo usar la colección Postman

1. Importar `SumaControl_API.postman_collection.json` en Postman.
2. Con el backend en `http://localhost:4000`, ajustar las variables `correo` y `password` de la colección.
3. Ejecutar primero `POST /api/auth/login`: guarda el token en la variable `token`.
4. Ejecutar la colección con Collection Runner. Cada solicitud registra si respondió en menos de 200 ms y sin error 500.

Nota: la colección de solo lectura se ejecutó con newman sobre `develop` y una base de pruebas aparte (usuario admin): 13 de 13 solicitudes en 200 y 0 fallos. Los tiempos de 1.2 a 1.4 ms por ruta que cita la ficha se midieron con un script local de 10 repeticiones sobre la base de demo (69 pedidos y 182 eventos).
