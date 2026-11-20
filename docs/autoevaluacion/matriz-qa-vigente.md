# Matriz QA vigente (PASS/FAIL) — pruebas unitarias de SumaControl

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

## Alcance y límites

- Estas son pruebas unitarias de funciones puras. Los casos funcionales y de integración (CP/PI, `backend/src/pruebas/`) requieren MongoDB y no se ejecutaron en esta corrida; su última corrida documentada es la del Plan de QA (Sprint 5, 17 de 17 PASS) en [`docs/entregables/Plan_Pruebas_QA_Grupo1.pdf`](../entregables/Plan_Pruebas_QA_Grupo1.pdf).
- El banco funcional del repositorio tiene hoy 21 casos (CP/PI); el Plan de QA documenta 17. Los casos de cola y de RBAC dinámico (Sprints 6 y 7) aún no tienen su corrida registrada.
- Módulos sin cobertura unitaria (0 %): `services/descargas.ts`, `services/cola.ts`, `services/promocionCola.ts`, `services/kpis.ts`, `services/roles.ts`. Se validan solo en el nivel funcional.
