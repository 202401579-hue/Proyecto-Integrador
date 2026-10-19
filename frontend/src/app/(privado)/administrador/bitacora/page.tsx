import BitacoraEventos from "@/components/BitacoraEventos";

// Bitácora de eventos para el Administrador. Es la misma tabla que ve el
// Coordinador: el layout privado ya deja entrar a cada rol solo a sus
// propias rutas, igual que con el tablero de gateways.
export default function PaginaBitacoraAdministrador() {
  return <BitacoraEventos />;
}
