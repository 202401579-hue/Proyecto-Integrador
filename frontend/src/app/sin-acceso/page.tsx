"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { cerrarSesion, obtenerSesion } from "@/lib/session";
import { rutaInicial } from "@/lib/permisos";

const sinSuscripcion = () => () => {};

/**
 * Pantalla a la que llega quien no tiene módulos habilitados, o quien escribe
 * en la barra una dirección que su rol no puede ver (Sprint 7).
 *
 * Es una ruta pública, fuera de (privado): si estuviera dentro, el guard del
 * layout la volvería a rebotar acá mismo. Que el usuario llegue o no a una
 * pantalla es solo comodidad; la protección de los datos la hace el backend
 * con el 403.
 */
export default function PaginaSinAcceso() {
  const router = useRouter();
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const sesion = montado ? obtenerSesion() : null;

  useEffect(() => {
    if (montado && !sesion) router.replace("/login");
  }, [montado, sesion, router]);

  if (!montado || !sesion) return null;

  const inicio = rutaInicial(sesion.permisos);
  const tieneModulos = inicio !== "/sin-acceso";

  const salir = () => {
    cerrarSesion();
    router.replace("/login");
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div className="card shadow p-4 text-center" style={{ width: "100%", maxWidth: "460px" }}>
        <i className="bi bi-lock fs-1 text-secondary" />
        <h1 className="h4 mt-2">
          {tieneModulos ? "No tiene acceso a esta pantalla" : "Su rol no tiene módulos habilitados"}
        </h1>
        <p className="text-muted">
          {tieneModulos
            ? "Su rol no incluye el permiso que necesita esta sección."
            : "Pídale a un administrador que le asigne un rol con permisos y vuelva a iniciar sesión."}
        </p>
        <div className="d-flex gap-2 justify-content-center">
          {tieneModulos && (
            <button type="button" className="btn btn-primary" onClick={() => router.replace(inicio)}>
              Ir a mi inicio
            </button>
          )}
          <button type="button" className="btn btn-outline-secondary" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
