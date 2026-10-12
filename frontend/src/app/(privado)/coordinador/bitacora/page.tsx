import BitacoraEventos from "@/components/BitacoraEventos";

// Bitácora de eventos para el Coordinador. Es la misma tabla que ve el
// Administrador: el layout privado ya deja entrar a cada rol solo a sus
// propias rutas, igual que con el tablero de gateways.
export default function PaginaBitacoraCoordinador() {
  return <BitacoraEventos />;
}
