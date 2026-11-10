import GatewaysTablero from "@/components/GatewaysTablero";

// Mantenimiento de gateways para el Administrador. Es el mismo tablero: el
// modo "mantenimiento" muestra los botones de poner fuera de servicio.
export default function PaginaGatewaysAdministrador() {
  return <GatewaysTablero modo="mantenimiento" />;
}
