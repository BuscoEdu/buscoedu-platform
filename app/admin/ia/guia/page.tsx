import Link from 'next/link';

const pasosAgente = [
  'Crear el agente con un código técnico estable. El código identifica el agente; no se escribe en el chat ni en rutas públicas.',
  'Crear una versión borrador desde el detalle del agente. Nunca se edita una versión publicada.',
  'Asociar los componentes de contexto y definir su orden: identidad, reglas, seguridad, conocimiento y formato.',
  'Configurar cada canal que podrá usar la versión (Web, WhatsApp u otros), incluyendo tono y reglas propias; después, en Canales, asignar cuál agente atiende cada canal público.',
  'Elegir el despliegue/modelo específico para la versión. No existen selecciones automáticas u ocultas.',
  'Simular una conversación y comparar el borrador con otra versión del mismo agente.',
  'Guardar y ejecutar al menos una prueba exitosa. Solo después se habilita la publicación.',
  'Publicar: la nueva versión queda activa, la anterior se desactiva y queda inmutable como respaldo.'
];

export default function GuiaGobiernoAgentesPage() {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Guía de gobierno de agentes IA</h1>
        <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">
          Este Centro es la fuente de configuración que usa NaIA en producción. Los textos, canales, modelo y versión activa se
          resuelven desde la base de datos; el código solo ejecuta las reglas de seguridad y el contrato técnico.
        </p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <h2 className="font-bold text-buscoedu-blue">Ruta para crear o evolucionar un agente</h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-buscoedu-text">
          {pasosAgente.map((paso, indice) => <li key={paso} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-buscoedu-blue text-xs font-bold text-white">{indice + 1}</span><span>{paso}</span></li>)}
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
          <h2 className="font-bold text-buscoedu-blue">Antes de producción</h2>
          <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">El sistema bloquea la publicación si falta un contexto, un canal, un despliegue explícito o una prueba exitosa. Esto evita agentes decorativos o configuraciones implícitas.</p>
        </div>
        <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
          <h2 className="font-bold text-buscoedu-blue">Cómo comparar</h2>
          <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">En la pestaña Simulación de una versión escribe el mismo mensaje y selecciona otra versión del mismo agente. Las dos respuestas se muestran lado a lado; ninguna se activa por esa prueba.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/ia/agentes" className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white">Ir a agentes</Link>
        <Link href="/admin/ia/contextos" className="rounded-lg border border-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-buscoedu-blue">Gestionar componentes</Link>
        <Link href="/admin/ia/canales" className="rounded-lg border border-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-buscoedu-blue">Asignar agentes a canales</Link>
      </div>
    </section>
  );
}
