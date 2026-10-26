import 'bootstrap/dist/css/bootstrap.min.css';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Gestión Logística",
  description: "Plataforma de gestión logística con autenticación por roles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Los iconos estaban solo en el layout privado. Desde el Sprint 5 el
            login también los usa, en las pantallas del segundo factor, así que
            la hoja se carga una sola vez acá para todas las páginas. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
        {children}
      </body>
    </html>
  );
}