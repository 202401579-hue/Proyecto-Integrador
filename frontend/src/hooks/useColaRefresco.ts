"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerCola, type ColaOrdenada } from "@/lib/cola";

/** Cada cuánto se vuelve a pedir la cola mientras la pestaña está visible. */
const INTERVALO_MS = 5000;

/** Cuánto dura en pantalla el aviso de "Salió de la cola: ...". */
const DURACION_AVISO_SALIDA_MS = 6000;

/** Mismo nombre que usa GatewaysTablero.tsx al publicar un cambio. */
const CANAL_CAMBIOS = "cola-cambios";

/**
 * Trae GET /api/cola, la refresca cada INTERVALO_MS (pausada mientras la
 * pestaña está oculta) y de inmediato cuando llega un mensaje por el
 * BroadcastChannel "cola-cambios" (lo publica GatewaysTablero.tsx después
 * de iniciar o finalizar una descarga). Si el navegador no soporta
 * BroadcastChannel, el sondeo sigue andando igual: es la única vía que le
 * queda.
 *
 * También detecta qué pedidos desaparecieron de una consulta a la
 * siguiente (salieron de la cola) y los expone unos segundos para que la
 * pantalla pueda avisarlo.
 */
export function useColaRefresco() {
  const [cola, setCola] = useState<ColaOrdenada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [avisosSalida, setAvisosSalida] = useState<string[]>([]);

  // pedidoId -> numeroPedido de la última consulta que sí trajo datos.
  const pedidosAnteriores = useRef<Map<string, string>>(new Map());

  const quitarAvisoSalida = useCallback((numeroPedido: string) => {
    setAvisosSalida((previos) => previos.filter((valor) => valor !== numeroPedido));
  }, []);

  const agregarAvisoSalida = useCallback(
    (numeroPedido: string) => {
      setAvisosSalida((previos) => [...previos, numeroPedido]);
      setTimeout(() => quitarAvisoSalida(numeroPedido), DURACION_AVISO_SALIDA_MS);
    },
    [quitarAvisoSalida]
  );

  const cargar = useCallback(async () => {
    const resultado = await obtenerCola();

    if (!resultado.ok || !resultado.datos) {
      setError(resultado.mensaje ?? "No se pudo cargar la cola");
      setCargando(false);
      return;
    }

    const datos = resultado.datos;
    const idsActuales = new Set(datos.items.map((item) => item.pedidoId));

    pedidosAnteriores.current.forEach((numeroPedido, pedidoId) => {
      if (!idsActuales.has(pedidoId)) {
        agregarAvisoSalida(numeroPedido);
      }
    });

    pedidosAnteriores.current = new Map(datos.items.map((item) => [item.pedidoId, item.numeroPedido]));

    setError("");
    setCola(datos);
    setCargando(false);
  }, [agregarAvisoSalida]);

  useEffect(() => {
    // La primera carga va en un callback y no directo en el cuerpo del
    // efecto (regla react-hooks/set-state-in-effect).
    const primeraCarga = setTimeout(cargar, 0);

    let intervalo: ReturnType<typeof setInterval> | null = null;

    const iniciarIntervalo = () => {
      if (intervalo !== null) return;
      intervalo = setInterval(() => {
        if (!document.hidden) cargar();
      }, INTERVALO_MS);
    };

    const detenerIntervalo = () => {
      if (intervalo === null) return;
      clearInterval(intervalo);
      intervalo = null;
    };

    iniciarIntervalo();

    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        detenerIntervalo();
      } else {
        cargar();
        iniciarIntervalo();
      }
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    const canal = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_CAMBIOS);
    if (canal) {
      canal.onmessage = () => cargar();
    }

    return () => {
      clearTimeout(primeraCarga);
      detenerIntervalo();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      canal?.close();
    };
  }, [cargar]);

  return { cola, cargando, error, avisosSalida, recargar: cargar };
}
