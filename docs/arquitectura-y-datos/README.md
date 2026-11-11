# Arquitectura y datos de SumaControl (MDS 0 – Semana 15)

- `schema.js`: validadores `$jsonSchema` e índices de las 8 colecciones (reemplaza a `schema.sql`).
  Ejecutar: `mongosh "mongodb://localhost:27017/logistica_db" --file schema.js`
- `diagramas/capas`: vista de 4 capas.
- `diagramas/componentes`: diagrama de componentes UML.
- `diagramas/despliegue`: diagrama de despliegue UML (HTTP/REST sobre TCP/IP, polling).
- `diagramas/der`: diagrama entidad-relación (modelo lógico MongoDB).

Fuentes `.dot` (Graphviz) incluidas junto a cada PNG.
