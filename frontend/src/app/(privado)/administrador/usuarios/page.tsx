import { redirect } from "next/navigation";

// La pantalla de usuarios se movió a /usuarios/gestion en el Sprint 7.
export default function UsuariosRutaVieja() {
  redirect("/usuarios/gestion");
}
