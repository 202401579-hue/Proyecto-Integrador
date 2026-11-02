"use client";

import { useState } from "react";
import TablaUsuarios from "@/components/usuarios/TablaUsuarios";
import UserForm from "@/components/usuarios/UserForm";
import { llamarApi, type Usuario } from "@/lib/usuarios";

/**
 * Administración de usuarios (Sprint 5). Solo para el Administrador.
 *
 * El rol se controla en tres lugares, y los tres hacen falta: el layout
 * privado no deja entrar a esta ruta a quien no sea Administrador, el enlace
 * del Sidebar ni aparece para los otros roles, y el backend exige el rol en
 * cada una de las seis rutas de /api/usuarios. Lo único que de verdad
 * protege los datos es el tercero; los dos primeros evitan que alguien
 * termine en una pantalla que no le va a funcionar.
 *
 * Esta página es la que coordina: la tabla lee, el formulario escribe y acá
 * viven el usuario que se está editando, el aviso de resultado y la señal de
 * recarga. Después de cada operación la lista se vuelve a pedir, sin recargar
 * el navegador.
 */

interface Resultado {
  texto: string;
  tipo: "success" | "danger";
}

export default function PaginaUsuarios() {
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Se incrementa después de cada operación. La tabla lo mira y vuelve a
  // pedir la lista.
  const [recargar, setRecargar] = useState(0);
  const refrescar = () => setRecargar((v) => v + 1);

  const editar = (usuario: Usuario) => {
    setResultado(null);
    setUsuarioEditando(usuario);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardado = (texto: string) => {
    setResultado({ texto, tipo: "success" });
    setUsuarioEditando(null);
    refrescar();
  };

  const reiniciarMfa = async (usuario: Usuario) => {
    const confirmado = window.confirm(
      `¿Reiniciar la verificación en dos pasos de "${usuario.nombre}"?\n\n` +
        "Se borran su autenticador y sus ocho códigos de recuperación. " +
        "Va a tener que configurarlo de nuevo en su próximo inicio de sesión."
    );
    if (!confirmado) return;

    setResultado(null);
    setOcupado(true);
    const respuesta = await llamarApi<{ mensaje: string }>(
      `/api/usuarios/${usuario._id}/mfa/reiniciar`,
      { metodo: "POST" }
    );
    setOcupado(false);

    // El backend distingue si el usuario tenía o no el MFA activado, y avisa
    // que reiniciar no levanta la exigencia. Se muestra su mensaje.
    setResultado(
      respuesta.ok
        ? { texto: respuesta.datos.mensaje, tipo: "success" }
        : { texto: respuesta.mensaje, tipo: "danger" }
    );

    if (respuesta.ok) refrescar();
  };

  const darDeBaja = async (usuario: Usuario) => {
    const confirmado = window.confirm(
      `¿Dar de baja a "${usuario.nombre}"?\n\n` +
        "No va a poder iniciar sesión. La cuenta no se borra: queda inactiva " +
        "y se puede seguir viendo con el interruptor \"Mostrar inactivos\"."
    );
    if (!confirmado) return;

    setResultado(null);
    setOcupado(true);
    const respuesta = await llamarApi<{ mensaje: string }>(`/api/usuarios/${usuario._id}`, {
      metodo: "DELETE",
    });
    setOcupado(false);

    if (!respuesta.ok) {
      setResultado({ texto: respuesta.mensaje, tipo: "danger" });
      return;
    }

    // Si se dio de baja justo al que estaba abierto en el formulario, se
    // cierra: guardar sobre una cuenta inactiva da 404.
    if (usuarioEditando?._id === usuario._id) {
      setUsuarioEditando(null);
    }

    setResultado({ texto: `Usuario "${usuario.nombre}" dado de baja.`, tipo: "success" });
    refrescar();
  };

  return (
    <div>
      <h2 className="h4 mb-4 d-flex align-items-center gap-2">
        <i className="bi bi-people text-primary" />
        Usuarios
      </h2>

      {resultado && (
        <div className={`alert alert-${resultado.tipo} py-2`}>{resultado.texto}</div>
      )}

      {/* La key hace que al pasar de una fila a otra React vuelva a montar el
          formulario, así los campos arrancan con los datos del usuario nuevo
          en lugar de quedar con los del anterior. */}
      <UserForm
        key={usuarioEditando?._id ?? "nuevo"}
        usuario={usuarioEditando}
        onGuardado={guardado}
        onCancelar={() => setUsuarioEditando(null)}
      />

      <TablaUsuarios
        recargar={recargar}
        ocupado={ocupado}
        onEditar={editar}
        onReiniciarMfa={reiniciarMfa}
        onDarDeBaja={darDeBaja}
      />
    </div>
  );
}
