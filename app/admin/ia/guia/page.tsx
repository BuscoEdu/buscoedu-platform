// Guía de gobierno de agentes IA (/admin/ia/guia) — página informativa, sin datos en vivo.
// Qué hace: explica en lenguaje sencillo cómo se crea, prueba y publica un agente, cómo responde
// NaIA en producción y qué puede cambiar el equipo sin programar.
// Para qué: que cualquier administrador entienda el proceso antes de tocar la configuración.
// El texto evita nombres técnicos internos (componentes, tablas, columnas) y está en español.
import Link from 'next/link';

// Pasos para crear o evolucionar un agente, cada uno con el enlace a la pantalla donde se hace.
const pasosAgente = [
  { texto: 'Crear el agente con un identificador estable. Ese identificador es interno: no se muestra en el chat ni en las páginas públicas.', href: '/admin/ia/agentes', accion: 'Abrir Agentes' },
  { texto: 'Crear una versión borrador desde el detalle del agente. Nunca se edita una versión publicada.', href: '/admin/ia/agentes', accion: 'Crear versión desde Agentes' },
  { texto: 'Asociar los componentes de contexto y definir su orden: identidad, reglas, seguridad, conocimiento y formato.', href: '/admin/ia/contextos', accion: 'Gestionar Contextos' },
  { texto: 'Configurar cada canal que podrá usar la versión (Web, WhatsApp u otros), incluyendo tono y reglas propias; después, en Canales, asignar cuál agente atiende cada canal público.', href: '/admin/ia/canales', accion: 'Configurar Canales' },
  { texto: 'Elegir el proveedor y el modelo específico para la versión. No existen selecciones automáticas u ocultas.', href: '/admin/ia/multiproveedor', accion: 'Configurar proveedores' },
  { texto: 'Simular una conversación y comparar el borrador con otra versión del mismo agente.', href: '/admin/ia/agentes', accion: 'Abrir Simulación de versión' },
  { texto: 'Guardar y ejecutar al menos una prueba exitosa. Solo después se habilita la publicación.', href: '/admin/ia/agentes', accion: 'Probar versión' },
  { texto: 'Publicar: la nueva versión queda activa, la anterior se desactiva y queda inmutable como respaldo.', href: '/admin/ia/agentes', accion: 'Publicar versión' }
];

// Recorrido de una pregunta del estudiante hasta la respuesta de NaIA, en lenguaje no técnico.
const flujoAgenteActivo = [
  'El estudiante escribe su pregunta en el buscador de NaIA de la página web.',
  'BuscoEdu identifica el canal (Web) y el agente que lo atiende (NaIA · Asesora educativa).',
  'Se carga la versión publicada de ese agente, con sus componentes de contexto en orden y el modelo elegido.',
  'Con esos componentes se arman las instrucciones que recibe el modelo, siempre en el mismo orden.',
  'El proveedor de IA configurado (hoy Abacus AI · NaIA) recibe las instrucciones y el mensaje del estudiante.',
  'La respuesta se ordena en mensaje, filtros y opciones, y se muestra al estudiante.'
];

// Componente de la página: solo pinta las secciones; no consulta la base de datos.
export default function GuiaGobiernoAgentesPage() {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      {/* Encabezado: para qué sirve este Centro. */}
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Guía de gobierno de agentes IA</h1>
        <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">
          Este Centro es la fuente de configuración que usa NaIA en producción. Los textos, canales, modelo y versión activa se
          toman de la configuración guardada aquí; la plataforma solo aplica las reglas de seguridad.
        </p>
      </div>

      {/* Pasos numerados para crear o evolucionar un agente. */}
      <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
        <h2 className="font-bold text-buscoedu-blue">Ruta para crear o evolucionar un agente</h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-buscoedu-text">
          {pasosAgente.map((paso, indice) => <li key={paso.accion} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-buscoedu-blue text-xs font-bold text-white">{indice + 1}</span><span>{paso.texto} <Link href={paso.href} className="ml-1 inline-flex font-semibold text-buscoedu-teal underline underline-offset-2">{paso.accion} →</Link></span></li>)}
        </ol>
      </div>

      {/* Dos recordatorios: qué bloquea la publicación y cómo comparar versiones. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
          <h2 className="font-bold text-buscoedu-blue">Antes de producción</h2>
          <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">El sistema bloquea la publicación si falta un contexto, un canal, un modelo elegido o una prueba exitosa. Esto evita agentes decorativos o configuraciones implícitas.</p>
        </div>
        <div className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
          <h2 className="font-bold text-buscoedu-blue">Cómo comparar</h2>
          <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">En la pestaña Simulación de una versión escribe el mismo mensaje y selecciona otra versión del mismo agente. Las dos respuestas se muestran lado a lado; ninguna se activa por esa prueba.</p>
        </div>
      </div>

      {/* Cómo responde un agente activo, qué se puede cambiar sin programar y advertencia final. */}
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
            Cambiar textos o instrucciones: <Link href="/admin/ia/contextos" className="font-semibold text-buscoedu-blue underline underline-offset-2">Gestionar contextos</Link>.
          </li>
          <li>
            Activar o desactivar componentes asociados a la versión activa: <Link href="/admin/ia/versiones" className="font-semibold text-buscoedu-blue underline underline-offset-2">Versiones</Link>.
          </li>
          <li>
            Cambiar el proveedor o el modelo: <Link href="/admin/ia/multiproveedor" className="font-semibold text-buscoedu-blue underline underline-offset-2">IA multiproveedor</Link>.
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
            Cada agente responde con su versión activa. Si el agente no tiene ninguna versión publicada y marcada como activa, el canal no puede responder con su configuración y NaIA contesta con un mensaje de respaldo.
          </p>
        </div>
      </div>

      {/* Accesos directos al final de la guía. */}
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/ia/agentes" className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white">Ir a agentes</Link>
        <Link href="/admin/ia/contextos" className="rounded-lg border border-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-buscoedu-blue">Gestionar componentes</Link>
        <Link href="/admin/ia/canales" className="rounded-lg border border-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-buscoedu-blue">Asignar agentes a canales</Link>
      </div>
    </section>
  );
}
