import GatewaysTablero from "@/components/GatewaysTablero";

// Tablero de gateways y descargas. Los botones de descarga dependen del permiso
// `descargas`, así que también los ve el Operador.
export default function PaginaCoordinador() {
  return <GatewaysTablero modo="anden" />;
}
