# Autoevaluación del Proyecto Integrador — SumaControl

Evidencias de la Ficha de Autoevaluación (Grupo N.º 1, Sección 1-1, MDS 0, ciclo 2-2026). Cubre las Secciones 7 y 9 del Documento Maestro.

| Archivo | Sección | Contenido |
|---|---|---|
| `Ficha_Autoevaluacion_Equipo1.pdf` | — | Ficha completa (3 bloques) |
| `matriz-qa-vigente.md` | 7 | Matriz PASS/FAIL de las 14 suites unitarias (139 casos), con reglas y HU |
| `resultado-jest.log` | 7 | Salida completa de `npx jest --verbose --coverage` sobre `develop` |
| `SumaControl_API.postman_collection.json` | 9 | Colección Postman con 27 solicitudes de los 13 módulos de la API; cada una verifica tiempo < 200 ms |

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

Nota: los tiempos de la ficha (promedio de 1.2 a 1.4 ms por ruta, con 69 pedidos y 182 eventos) se midieron con un script local de 10 repeticiones por ruta, no con esta colección. La colección queda como instrumento para repetir la medición con más volumen.
