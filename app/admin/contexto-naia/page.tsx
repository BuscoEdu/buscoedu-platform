export default function AdminContextoNaiaPage() {
  return (
    <section className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-6 shadow-card">
      <h1 className="text-2xl font-bold text-buscoedu-blue">Contexto NaIA</h1>
      <p className="text-sm text-buscoedu-muted">
        Módulo reservado para la Fase 6. Aquí se administrarán instrucciones, tono y contexto publicado de NaIA.
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Placeholder activo: por ahora no hay mutaciones en base de datos desde esta pantalla.
      </div>
    </section>
  );
}
