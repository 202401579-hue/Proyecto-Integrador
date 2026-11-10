"use client";

import EncabezadoCola from "@/components/cola/EncabezadoCola";
import TarjetaPedidoCola from "@/components/cola/TarjetaPedidoCola";
import { useColaRefresco } from "@/hooks/useColaRefresco";

/**
 * Tablero de la cola de espera (Sprint 6). Se usa en /cola, la misma
 * pantalla para los tres roles (permiso `cola`, ver lib/permisosRutas.ts).
 *
 * Las tarjetas se dibujan estrictamente en el orden que manda la API: este
 * componente nunca las reordena del lado del cliente.
 */
export default function TableroCola() {
  const { cola, cargando, error, avisosSalida, recargar } = useColaRefresco();

  if (cargando && !cola) {
    return (
      <div className="text-center text-muted py-5">
        <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        Cargando la cola...
      </div>
    );
  }

  if (error && !cola) {
    return (
      <div className="alert alert-danger" role="alert">
        {error}
      </div>
    );
  }

  if (!cola) {
    return null;
  }

  return (
    <div className="d-flex flex-column gap-3">
      {avisosSalida.map((numeroPedido, indice) => (
        <div key={`${numeroPedido}-${indice}`} className="alert alert-info mb-0" role="alert">
          Salió de la cola: {numeroPedido}
        </div>
      ))}

      {error && (
        <div className="alert alert-warning mb-0" role="alert">
          {error}
        </div>
      )}

      <EncabezadoCola
        totalPedidos={cola.items.length}
        factorAgingMin={cola.factorAgingMin}
        limiteEsperaMax={cola.limiteEsperaMax}
        generadoEn={cola.generadoEn}
        onReevaluado={recargar}
      />

      {cola.items.length === 0 ? (
        <div className="alert alert-light border text-center mb-0" role="status">
          No hay pedidos en espera
        </div>
      ) : (
        <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4 g-3">
          {cola.items.map((item) => (
            <div className="col" key={item.pedidoId}>
              <TarjetaPedidoCola item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
