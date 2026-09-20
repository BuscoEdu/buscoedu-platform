import Link from 'next/link';

const pasosAgente = [
  { texto: 'Crear el agente con un código técnico estable. El código identifica el agente; no se escribe en el chat ni en rutas públicas.', href: '/admin/ia/agentes', accion: 'Abrir Agentes' },
  { texto: 'Crear una versión borrador desde el detalle del agente. Nunca se edita una versión publicada.', href: '/admin/ia/agentes', accion: 'Crear versión desde Agentes' },
  { texto: 'Asociar los componentes de contexto y definir su orden: identidad, reglas, seguridad, conocimiento y formato.', href: '/admin/ia/contextos', accion: 'Gestionar Contextos' },
  { texto: 'Configurar cada canal que podrá usar la versión (Web, WhatsApp u otros), incluyendo tono y reglas propias; después, en Canales, asignar cuál agente atiende cada canal público.', href: '/admin/ia/canales', accion: 'Configurar Canales' },
  { texto: 'Elegir el despliegue/modelo específico para la versión. No existen selecciones automáticas u ocultas.', href: '/admin/ia/proveedores', accion: 'Configurar Proveedores' },
  { texto: 'Simular una conversación y comparar el borrador con otra versión del mismo agente.', href: '/admin/ia/agentes', accion: 'Abrir Simulación de versión' },
  { texto: 'Guardar y ejecutar al menos una prueba exitosa. Solo después se habilita la publicación.', href: '/admin/ia/agentes', accion: 'Probar versión' },
  { texto: 'Publicar: la nueva versión queda activa, la anterior se desactiva y queda inmutable como respaldo.', href: '/admin/ia/agentes', accion: 'Publicar versión' }
];

const flujoAgenteActivo = [
  'El estudiante escribe en la interfaz y el frontend (NaiaSearchExperience) llama a /api/naia.',
  'La ruta resuelve el canal web y obtiene el agente predeterminado (naia_asesora_educativa).',
  'AgenteExecutor carga desde Supabase la versión activa, sus contextos ordenados y el despliegue.',
  'El prompt de sistema se construye concatenando componentes de contexto por campo orden.',
  'AbacusAdapter llama a Abacus.AI con prompt + mensaje del estudiante.',
  'La respuesta se parsea como JSON (mensaje, filtros, opciones) y vuelve al frontend.'
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
          {pasosAgente.map((paso, indice) => <li key={paso.accion} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-buscoedu-blue text-xs font-bold text-white">{indice + 1}</span><span>{paso.texto} <Link href={paso.href} className="ml-1 inline-flex font-semibold text-buscoedu-teal underline underline-offset-2">{paso.accion} →</Link></span></li>)}
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

      <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <h2 className="text-lg font-bold text-buscoedu-blue">Cómo funciona un agente activo y cómo actualizarlo</h2>

        <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-buscoedu-teal">Flujo en producción (NaIA)</h3>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-buscoedu-text">
          {flujoAgenteActivo.map((paso, indice) => (
            <li key={paso} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-buscoedu-blue text-[11px] font-bold text-white">{indice + 1}</span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-buscoedu-teal">Qué puede actualizar un administrador sin tocar código</h3>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-buscoedu-text">
          <li>
            Cambiar textos/instrucciones: <Link href="/admin/ia/contextos" className="font-semibold text-buscoedu-blue underline underline-offset-2">Gestionar contextos</Link>.
          </li>
          <li>
            Activar/desactivar componentes asociados a la versión activa: <Link href="/admin/ia/versiones" className="font-semibold text-buscoedu-blue underline underline-offset-2">Versiones</Link>.
          </li>
          <li>
            Cambiar modelo/proveedor o despliegue: <Link href="/admin/ia/proveedores" className="font-semibold text-buscoedu-blue underline underline-offset-2">Proveedores y despliegues</Link>.
          </li>
          <li>
            Ver conversaciones y ejecuciones: <Link href="/admin/ia/ejecuciones" className="font-semibold text-buscoedu-blue underline underline-offset-2">Ejecuciones</Link>.
          </li>
          <li>
            Cambios que requieren nueva versión: crear borrador en <Link href="/admin/ia/agentes" className="font-semibold text-buscoedu-blue underline underline-offset-2">Agentes</Link>, editar y publicar.
          </li>
          <li>
            Revisar asignación de canal web y agente predeterminado: <Link href="/admin/ia/canales" className="font-semibold text-buscoedu-blue underline underline-offset-2">Canales</Link>.
          </li>
        </ul>

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
          <p className="font-semibold">Advertencia operativa</p>
          <p>
            El agente usa la versión marcada como <code className="rounded bg-amber-100 px-1">activa</code> en la tabla <code className="rounded bg-amber-100 px-1">agentes_ia</code>. Si ninguna versión tiene estado <code className="rounded bg-amber-100 px-1">publicada</code> y está enlazada en <code className="rounded bg-amber-100 px-1">version_activa_id</code>, el canal no responde y cae en fallback.
          </p>
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
