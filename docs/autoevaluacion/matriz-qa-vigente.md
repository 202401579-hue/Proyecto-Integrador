# Matriz QA vigente (PASS/FAIL) — SumaControl

## Pruebas unitarias — 139 de 139 PASS

Corrida real sobre la rama `develop` (commit 8218755), Node v22 en Linux, `npx jest --verbose --coverage` desde `backend/`. La salida completa está en [`resultado-jest.log`](resultado-jest.log).

| Suite | Reglas / alcance | HU | Casos | PASS | FAIL | Estado |
|---|---|---|---|---|---|---|
| `numeroPedido.test.ts` | RN-03 | HU-001 | 8 | 8 | 0 | PASS |
| `ventanaHoraria.test.ts` | RN-01, RN-02, RN-14 | HU-001 | 17 | 17 | 0 | PASS |
| `programadaParaPuntualidad.test.ts` | Cálculo inverso de puntualidad para el seed de demo (Sprint 6) | HU-002 | 11 | 11 | 0 | PASS |
| `puntualidad.test.ts` | RN-04, RN-05 | HU-002 | 14 | 14 | 0 | PASS |
| `cambiosAging.test.ts` | Detección de cambios por aging (Sprint 6) | HU-003 | 4 | 4 | 0 | PASS |
| `construirCola.test.ts` | Cola de prioridad con aging | HU-003 | 13 | 13 | 0 | PASS |
| `gateways.test.ts` | RN-07, RN-08 | HU-003 | 9 | 9 | 0 | PASS |
| `heapBinario.test.ts` | EDA 0 (Heap binario) | HU-003 | 5 | 5 | 0 | PASS |
| `prioridad.test.ts` | Prioridad base y aging por espera | HU-003 | 14 | 14 | 0 | PASS |
| `validarTurno.test.ts` | Orden estricto de la cola (Sprint 6) | HU-003 | 4 | 4 | 0 | PASS |
| `login.test.ts` | RN-15 | HU-004 | 8 | 8 | 0 | PASS |
| `mfa.test.ts` | RN-16, RN-17 | HU-004 | 22 | 22 | 0 | PASS |
| `tokens.test.ts` | JWT ACCESS / MFA_TEMP | HU-004, HU-005 | 4 | 4 | 0 | PASS |
| `permisos.test.ts` | RBAC dinámico (Sprint 7) | HU-005 | 6 | 6 | 0 | PASS |

**Total: 14 suites, 139 casos, 139 PASS, 0 FAIL.** Cobertura global de sentencias: 35.35 % (ramas 29.91 %).

## Pruebas funcionales e integrales (CP/PI) — 21 de 21 PASS

Corrida real del 21 de noviembre de 2026 sobre la rama `develop`, con `npm run test:funcional` contra el backend en el puerto 4001 y una base aparte (`logistica_qa`, sembrada con 3 usuarios, 3 roles, 9 parámetros y 5 bahías), sin tocar los datos de demo. El caso, el resultado y el archivo de salida están en [`resultado-funcional.log`](resultado-funcional.log).

| Caso | Descripción | Reglas | HU | Resultado |
|---|---|---|---|---|
| CP-01 | Proveedor puntual con gateway general libre | RN-04, RN-05, RN-07 | HU-002 | PASS |
| CP-02 | Proveedor puntual sin bahía general disponible | RN-10 | HU-002 | PASS |
| CP-03 | Proveedor tardío que excede la ventana de tolerancia | RN-04 | HU-002 | PASS |
| CP-04 | Proveedor ausente que no se presenta en toda la ventana | RN-06 | HU-002 | PASS |
| CP-05 | Producto de construcción asignado al Gateway 5 | RN-08 | HU-003 | PASS |
| CP-06 | Carga general rechazada en el Gateway 5 con el resto ocupado | RN-07, RN-08 | HU-003 | PASS |
| CP-07 | Finalización de descarga en bahía general y promoción de cola | RN-09, RN-11, RN-12 | HU-003 | PASS |
| CP-08 | Finalización en Gateway 5 con promoción filtrada por tipo | RN-08, RN-11, RN-12 | HU-003 | PASS |
| CP-09 | Bahía fuera de servicio excluida de toda asignación | RN-13 | HU-003 | PASS |
| CP-10 | Orden de atención de la cola por antigüedad de arribo | RN-12 | HU-003 | PASS |
| CP-11 | Reprogramación de cita con validación de horario y solapamiento | RN-01, RN-02, RN-14 | HU-001 | PASS |
| CP-12 | Autogeneración correlativa del número de pedido | RN-03 | HU-001 | PASS |
| CP-13 | GET /api/cola ordena por prioridad con esperas iguales (Sprint 6) | RN-04, RN-12 (prioridad y aging) | HU-003 | PASS |
| CP-14 | La promoción automática nunca cruza tipos de carga (Sprint 6) | RN-07, RN-08, RN-11 | HU-003 | PASS |
| CP-15 | POST /api/descargas/iniciar respeta el orden estricto de la cola (Sprint 6) | RN-12 (orden estricto) | HU-003 | PASS |
| PI-01 | Alta de proveedor y programación de cita por la API | RN-01, RN-02, RN-03 · HU-001 / CU-01 | HU-001 | PASS |
| PI-02 | Registro de llegada y clasificación con asiento en bitácora | RN-04, RN-05 · HU-002 / CU-02 | HU-002 | PASS |
| PI-03 | Ciclo completo de descarga con promoción automática de cola | RN-09, RN-11, RN-12 · HU-003 / CU-03 | HU-003 | PASS |
| PI-04 | Cálculo de indicadores sobre la operación registrada | RNF-03 · Tablero de indicadores | — | PASS |
| PI-05 | Matriz de permisos dinámicos para los tres roles base | Sprint 7 — matriz RBAC | HU-005 | PASS |
| PI-06 | Rol personalizado, revocación inmediata y baja protegida | Sprint 7 — roles dinámicos | HU-005, HU-006 (parcial) | PASS |

**Total: 21 casos, 21 PASS, 0 FAIL.**

## Alcance y límites

- Las pruebas unitarias (arriba) validan funciones puras y no requieren base de datos. Las funcionales (esta sección) ejercitan la API REST en ejecución y verifican el estado en MongoDB.
- HU-006 (administración de usuarios) solo se cubre de forma parcial: PI-06 crea un usuario con un rol personalizado, revoca permisos y comprueba la baja protegida; no hay caso propio para editar datos ni reiniciar el MFA.
- HU-004 (JWT y MFA) se respalda con las pruebas unitarias; los casos funcionales solo usan el login como paso previo.
- Plan de QA anterior (Sprint 5, 17 de 17 PASS): [`docs/entregables/Plan_Pruebas_QA_Grupo1.pdf`](../entregables/Plan_Pruebas_QA_Grupo1.pdf). Esta corrida lo amplía con CP-13 a CP-15 y PI-06 (Sprints 6 y 7).
- Módulos sin cobertura unitaria (0 %): `services/descargas.ts`, `services/cola.ts`, `services/promocionCola.ts`, `services/kpis.ts`, `services/roles.ts`; los ejercita el nivel funcional.
- No hay pruebas de concurrencia (dos peticiones simultáneas al mismo gateway, RN-09) ni de caída de red durante el registro de una llegada.
