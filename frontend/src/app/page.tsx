export default function Home() {
  return (
    <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light text-center">
      <h1 className="mb-3">Sistema de Gestión Logística</h1>
      <p className="text-muted mb-4">Inicia sesión para continuar.</p>
      <a href="/login" className="btn btn-primary">
        Ir al login
      </a>
    </div>
  );
}