export const PanelAccessError = () => (
  <div role="alert" className="container mx-auto max-w-lg px-4 py-16 text-center">
    <h1 className="mb-3 text-2xl font-bold">No pudimos cargar tu panel</h1>
    <p className="mb-6 text-muted-foreground">
      No pudimos obtener los datos de tu cuenta. Tu sesión sigue abierta. Intenta nuevamente.
    </p>
    <a href="/panel" className="inline-flex rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      Reintentar
    </a>
  </div>
)
