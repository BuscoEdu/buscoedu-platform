"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type NeedOption =
  | "Recibir más oportunidades"
  | "Mejorar la calidad de los leads"
  | "Aumentar la conversión"
  | "Promocionar programas concretos"
  | "Activar una campaña comercial"
  | "Analizar la demanda por mercado"
  | "Explorar una alianza estratégica";

interface FormState {
  nombre_apellidos: string;
  cargo: string;
  universidad: string;
  correo_institucional: string;
  pais_mercado: string;
  telefono: string;
  programas_prioritarios: string;
  modalidad_potenciar: string;
  matriculas_objetivo: string;
  convocatoria_proxima: string;
  necesidad_principal: NeedOption;
  interes_descuentos: boolean;
  comentarios: string;
}

const pasos = [
  "Conversa con NaIA",
  "Define qué quieres estudiar",
  "Indica modalidad, ubicación y necesidades",
  "Compara opciones",
  "Autoriza el contacto",
  "La universidad recibe la oportunidad con contexto",
  "Se activa la propuesta comercial autorizada",
  "Se mide avance hasta matrícula",
];

const pilares = [
  {
    titulo: "Orientación",
    texto:
      "El estudiante aclara su decisión antes del contacto comercial, reduciendo ruido en la etapa inicial.",
  },
  {
    titulo: "Contexto",
    texto:
      "La universidad recibe variables clave para iniciar conversaciones más relevantes y accionables.",
  },
  {
    titulo: "Consentimiento",
    texto:
      "La transferencia de datos solo ocurre con autorización expresa del estudiante.",
  },
  {
    titulo: "Activación comercial",
    texto:
      "Cuando la alianza lo contempla, se aplican condiciones autorizadas para facilitar la decisión.",
  },
];

const beneficios = [
  "Mejor calidad de oportunidad",
  "Conversaciones más relevantes desde admisiones",
  "Mejor uso operativo del equipo",
  "Condiciones comerciales selectivas",
  "Protección de marca institucional",
  "Trazabilidad del origen y del consentimiento",
];

const faqItems = [
  {
    q: "¿BuscoEdu vende bases de datos?",
    a: "No. BuscoEdu conecta universidades con estudiantes que han mostrado interés y han autorizado el contacto dentro del modelo definido.",
  },
  {
    q: "¿El estudiante recibe orientación antes de ser contactado?",
    a: "Sí. BuscoEdu ayuda al estudiante a ordenar su decisión antes de conectarlo con una universidad.",
  },
  {
    q: "¿La universidad recibe todos los datos del estudiante?",
    a: "Recibe únicamente la información disponible y autorizada por el estudiante.",
  },
  {
    q: "¿El estudiante puede seleccionar más de una universidad?",
    a: "Sí, según el flujo vigente y las autorizaciones que otorgue durante su proceso de exploración.",
  },
  {
    q: "¿La universidad puede ofrecer descuentos?",
    a: "Sí, cuando el programa de alianza lo contempla y la universidad autoriza condiciones, alcance y vigencia.",
  },
  {
    q: "¿Quién define el descuento o beneficio?",
    a: "La universidad lo aprueba. BuscoEdu acompaña su estructuración y comunicación dentro del flujo autorizado.",
  },
  {
    q: "¿Cómo se controla el uso del descuento?",
    a: "Con reglas de elegibilidad, vigencia y trazabilidad de la oportunidad asociada a la condición comercial.",
  },
  {
    q: "¿Puedo saber de dónde viene el estudiante?",
    a: "Sí. La universidad recibe el origen de la oportunidad y la trazabilidad disponible dentro del marco legal y operativo aplicable.",
  },
  {
    q: "¿Puedo integrar BuscoEdu con mi CRM?",
    a: "Es una capacidad contemplada en la hoja de ruta. La implementación concreta se define según la madurez del piloto y el stack de la universidad.",
  },
  {
    q: "¿BuscoEdu garantiza matrículas?",
    a: "No. BuscoEdu conecta oportunidades; la matrícula depende también del proceso de admisión, oferta, precio y decisión del estudiante.",
  },
  {
    q: "¿NaIA favorece a universidades que pagan más?",
    a: "No como criterio académico. La coincidencia parte del perfil del estudiante; la visibilidad comercial se gestiona de forma transparente y sin recomendación engañosa.",
  },
];

const formInicial: FormState = {
  nombre_apellidos: "",
  cargo: "",
  universidad: "",
  correo_institucional: "",
  pais_mercado: "",
  telefono: "",
  programas_prioritarios: "",
  modalidad_potenciar: "",
  matriculas_objetivo: "",
  convocatoria_proxima: "",
  necesidad_principal: "Recibir más oportunidades",
  interes_descuentos: false,
  comentarios: "",
};

export default function UniversidadesLanding() {
  const [form, setForm] = useState<FormState>(formInicial);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  const confianza = useMemo(
    () => [
      "Oportunidades con contexto de interés",
      "Consentimiento verificable",
      "Condiciones comerciales adaptables",
      "Protección de la imagen institucional",
    ],
    []
  );

  // Métricas ilustrativas (placeholder) para reforzar propuesta de valor.
  const statsRef = useRef<HTMLDivElement | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [contadorEstudiantes, setContadorEstudiantes] = useState(0);
  const [contadorUniversidades, setContadorUniversidades] = useState(0);
  const [contadorConsentimiento, setContadorConsentimiento] = useState(0);
  const [contadorCalidad, setContadorCalidad] = useState(0);

  // Revelado progresivo al entrar al viewport para secciones y tarjetas.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll(".fade-in-section").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Activamos el contador solo cuando la sección se vuelve visible.
  useEffect(() => {
    const target = statsRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStatsVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!statsVisible) return;

    const DURACION_MS = 1400;
    const TICKS = 35;
    const INTERVALO = Math.floor(DURACION_MS / TICKS);

    let paso = 0;
    const timer = setInterval(() => {
      paso += 1;
      const progreso = Math.min(1, paso / TICKS);

      setContadorEstudiantes(Math.round(500 * progreso));
      setContadorUniversidades(Math.round(12 * progreso));
      setContadorConsentimiento(Math.round(87 * progreso));
      setContadorCalidad(Number((3 * progreso).toFixed(1)));

      if (progreso >= 1) {
        clearInterval(timer);
        setContadorEstudiantes(500);
        setContadorUniversidades(12);
        setContadorConsentimiento(87);
        setContadorCalidad(3);
      }
    }, INTERVALO);

    return () => clearInterval(timer);
  }, [statsVisible]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEnviando(true);
    setMensaje(null);

    try {
      const response = await fetch("/api/universidades/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "No fue posible registrar la solicitud.");
      }

      setForm(formInicial);
      setMensaje(
        "Hemos recibido tu solicitud. Nuestro equipo revisará la información y se pondrá en contacto contigo para entender tus objetivos de captación y proponerte el modelo de colaboración más adecuado."
      );
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No fue posible registrar la solicitud.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-white">
      {/* CTA sticky móvil para mantener visibilidad durante el recorrido largo. */}
      <div className="sticky top-[64px] z-30 border-b border-buscoedu-border bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <a
          href="#form-alianza"
          className="inline-flex w-full items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white"
        >
          Solicitar una reunión de alianza
        </a>
      </div>

      {/* 1) HERO */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section rounded-3xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-buscoedu-teal">BuscoEdu para universidades</p>
                <div className="mt-3 inline-flex rounded-full border border-buscoedu-blue/20 bg-buscoedu-blue/5 px-3 py-1 text-xs font-semibold text-buscoedu-blue">
                  🎓 Plataforma de orientación educativa · Colombia
                </div>
                <h1 className="mt-3 text-4xl font-bold tracking-tight text-buscoedu-blue sm:text-5xl">
                  Conecta con estudiantes que están preparados para tomar una decisión
                </h1>
                <p className="mt-5 text-base leading-relaxed text-buscoedu-muted sm:text-lg">
                  BuscoEdu orienta a futuros estudiantes, identifica sus necesidades académicas y económicas y conecta a cada persona con universidades que pueden responder a su perfil. La universidad recibe oportunidades con contexto, consentimiento y una propuesta comercial alineada con sus objetivos de matrícula.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="#form-alianza"
                    className="rounded-lg bg-buscoedu-blue px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
                  >
                    Solicitar una reunión de alianza
                  </a>
                  <a
                    href="#modelo"
                    className="rounded-lg border border-buscoedu-blue px-5 py-3 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-blue/5"
                  >
                    Conocer el modelo
                  </a>
                </div>

                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {confianza.map((item) => (
                    <div key={item} className="fade-in-section rounded-lg border border-buscoedu-border bg-buscoedu-bg px-3 py-2 text-sm font-medium text-buscoedu-text">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="fade-in-section rounded-2xl border border-buscoedu-border bg-buscoedu-bg p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-buscoedu-teal">Recorrido del estudiante</p>
                  <ol className="mt-3 space-y-2 text-sm text-buscoedu-text">
                    {pasos.map((paso, index) => (
                      <li key={paso} className="flex gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-buscoedu-blue text-[11px] font-bold text-white">{index + 1}</span>
                        <span>{paso}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-buscoedu-teal">Vista de oportunidad para la universidad</p>
                  <div className="mt-3 space-y-2 text-sm text-buscoedu-text">
                    <p><strong>Programa:</strong> Ingeniería de Sistemas</p>
                    <p><strong>Modalidad:</strong> Virtual / Presencial</p>
                    <p><strong>Mercado:</strong> Colombia - Costa Norte</p>
                    <p><strong>Necesidad:</strong> Financiación y flexibilidad horaria</p>
                    <p><strong>Autorización:</strong> Contacto aprobado por el estudiante</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 2) NUEVA SECCIÓN DE ESTADÍSTICAS */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div ref={statsRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-6">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Impacto inicial del ecosistema BuscoEdu</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card">
                <p className="text-3xl font-bold text-buscoedu-blue">{contadorEstudiantes}+</p>
                <p className="mt-2 text-sm text-buscoedu-muted">estudiantes orientados</p>
              </article>
              <article className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card">
                <p className="text-3xl font-bold text-buscoedu-blue">{contadorUniversidades}</p>
                <p className="mt-2 text-sm text-buscoedu-muted">universidades aliadas</p>
              </article>
              <article className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card">
                <p className="text-3xl font-bold text-buscoedu-blue">{contadorConsentimiento}%</p>
                <p className="mt-2 text-sm text-buscoedu-muted">de consentimiento explícito</p>
              </article>
              <article className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card">
                <p className="text-3xl font-bold text-buscoedu-blue">{contadorCalidad}x</p>
                <p className="mt-2 text-sm text-buscoedu-muted">mejor calidad de oportunidad</p>
              </article>
            </div>
          </section>
        </div>
      </div>

      {/* 3) PROBLEMA */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section id="modelo" className="fade-in-section space-y-6">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Captar estudiantes no consiste únicamente en generar más contactos</h2>
            <p className="max-w-4xl text-base leading-relaxed text-buscoedu-muted">
              Muchas universidades reciben oportunidades sin suficiente contexto, sin autorización clara o sin señales de decisión. BuscoEdu interviene antes de la llamada comercial: orienta al estudiante y permite que el equipo de admisiones reciba una oportunidad más comprensible y accionable.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <CardSimple titulo="Leads sin contexto" texto="Llega un nombre y un teléfono, pero no siempre se conoce el programa de interés, modalidad, momento de decisión o necesidad económica." />
              <CardSimple titulo="Captación costosa" texto="La presión está en generar y depurar oportunidades. El costo no termina en el lead: también está en la gestión de registros que no avanzan." />
              <CardSimple titulo="Propuesta económica tardía" texto="Existe interés académico, pero el estudiante no avanza cuando desconoce alternativas de financiación, becas o descuentos aplicables." />
            </div>
          </section>
        </div>
      </div>

      {/* 4) SOLUCIÓN */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Orientación antes del contacto. Contexto antes de la conversación. Propuesta antes de la decisión.</h2>
            <p className="max-w-5xl text-base leading-relaxed text-buscoedu-muted">
              NaIA ayuda a identificar intereses, expectativas, modalidad, ubicación, presupuesto y momento de decisión. Cuando el estudiante autoriza expresamente el contacto, BuscoEdu conecta la oportunidad con la universidad correspondiente.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {pilares.map((pilar) => (
                <div key={pilar.titulo} className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-buscoedu-teal/15 text-buscoedu-teal">
                    <IconoPilar />
                  </div>
                  <h3 className="text-lg font-bold text-buscoedu-blue">{pilar.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{pilar.texto}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 5) CÓMO FUNCIONA */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Cómo funciona la alianza</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "La universidad configura su oferta",
                "El estudiante se orienta con NaIA",
                "BuscoEdu identifica opciones por perfil",
                "El estudiante decide con quién avanzar",
                "Se solicita autorización",
                "La universidad recibe la oportunidad",
                "Se activa propuesta comercial autorizada",
                "Se mide resultado hasta matrícula",
              ].map((paso, idx) => (
                <div key={paso} className="fade-in-section flex gap-3 rounded-xl border border-buscoedu-border bg-white p-4 transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-buscoedu-blue text-xs font-bold text-white">{idx + 1}</span>
                  <p className="text-sm leading-relaxed text-buscoedu-text">{paso}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 6) QUÉ RECIBE */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">No recibes solo un contacto. Recibes una oportunidad con contexto</h2>
            <div className="rounded-2xl border border-buscoedu-border bg-white p-6 shadow-card">
              <p className="mb-4 text-sm text-buscoedu-muted">La información disponible dependerá de la conversación del estudiante y de los datos que haya autorizado compartir.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  "Nombre y datos de contacto",
                  "Programa o área de interés",
                  "Modalidad preferida",
                  "Ubicación o mercado",
                  "Nivel de estudios",
                  "Momento estimado de decisión",
                  "Necesidad de financiación",
                  "Motivación principal",
                  "Preguntas y dudas expresadas",
                  "Universidad seleccionada",
                  "Canal y fecha de autorización",
                  "Origen de la oportunidad",
                ].map((item) => (
                  <div key={item} className="fade-in-section rounded-lg border border-buscoedu-border bg-buscoedu-bg px-3 py-2 text-sm text-buscoedu-text transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 7) CONDICIONES COMERCIALES */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5 rounded-2xl border border-buscoedu-teal/25 bg-buscoedu-teal/5 p-6">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Mejores condiciones para el estudiante sin devaluar tu universidad</h2>
            <p className="text-base leading-relaxed text-buscoedu-muted">
              Cuando la universidad lo habilita, BuscoEdu puede activar condiciones comerciales específicas para estudiantes derivados a través de la plataforma. La institución mantiene control sobre alcance, reglas y vigencia.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <CardSimple titulo="Tipos de beneficio" texto="Descuento de matrícula, beneficio condicionado, condición temporal o esquema exclusivo por campaña autorizada." />
              <CardSimple titulo="Reglas de control" texto="Elegibilidad por perfil/programa, periodo de vigencia, condiciones de uso y trazabilidad de oportunidad." />
            </div>
            <p className="rounded-lg border border-buscoedu-teal/30 bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue">
              Más flexibilidad comercial para el estudiante. Más control de marca para la universidad.
            </p>
          </section>
        </div>
      </div>

      {/* 8) PROTECCIÓN DE MARCA */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-4">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Protección de la marca institucional</h2>
            <p className="text-base leading-relaxed text-buscoedu-muted">
              La alianza no implica perder control de comunicación, precios públicos ni narrativa institucional. Cada universidad define programas, mensajes, beneficios autorizados y forma de presentación frente al estudiante.
            </p>
          </section>
        </div>
      </div>

      {/* 9) BENEFICIOS */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Beneficios para admisiones y marketing</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {beneficios.map((beneficio) => (
                <div key={beneficio} className="fade-in-section rounded-xl border border-buscoedu-border bg-white p-4 shadow-card transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-buscoedu-blue/10 text-buscoedu-blue">
                    <IconoCheck />
                  </div>
                  <p className="text-sm font-medium text-buscoedu-text">{beneficio}</p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <a
                href="#form-alianza"
                className="inline-flex rounded-lg bg-buscoedu-blue px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Solicitar una reunión de alianza
              </a>
            </div>
          </section>
        </div>
      </div>

      {/* 10) MODALIDADES */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Modalidades de alianza</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <CardNivel titulo="Presencia" bullets={["Publicación de programas", "Ficha institucional", "Señales básicas de demanda", "Revisión de contenidos"]} />
              <CardNivel titulo="Conexión" bullets={["Recepción de oportunidades autorizadas", "Contexto para contacto", "Reportes básicos", "Activación de condiciones comerciales autorizadas"]} />
              <CardNivel titulo="Alianza estratégica" bullets={["Mayor visibilidad por objetivo", "Campañas específicas", "Reportes avanzados", "Optimización conjunta por convocatoria"]} />
            </div>
          </section>
        </div>
      </div>

      {/* 11) MEDICIÓN */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Medición y resultados</h2>
            <p className="text-base leading-relaxed text-buscoedu-muted">
              La alianza se evalúa desde orientación y autorización hasta conversaciones efectivas, solicitudes de admisión y matrícula. Durante la fase inicial, el enfoque es piloto medible con aprendizaje compartido.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Estudiantes orientados",
                "Autorizaciones de contacto",
                "Oportunidades entregadas",
                "Contactabilidad",
                "Conversaciones efectivas",
                "Solicitudes de admisión",
                "Matrículas",
                "Conversión por programa",
              ].map((kpi) => (
                <div key={kpi} className="fade-in-section rounded-lg border border-buscoedu-border bg-white px-3 py-2 text-sm text-buscoedu-text transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  {kpi}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 12) PILOTO */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Programa piloto</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <CardSimple titulo="Definición" texto="Objetivo de matrícula, programas prioritarios, público objetivo, reglas de contacto e indicadores." />
              <CardSimple titulo="Configuración" texto="Carga de programas, validación de contenidos, definición de beneficios y alistamiento operativo." />
              <CardSimple titulo="Activación" texto="Inicio de orientación, recepción de oportunidades y seguimiento de contacto." />
              <CardSimple titulo="Evaluación" texto="Revisión de calidad, avance comercial, uso de beneficios y recomendación de continuidad." />
            </div>
          </section>
        </div>
      </div>

      {/* 13) FAQ */}
      <div className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="fade-in-section space-y-5">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Preguntas frecuentes</h2>
            <div className="space-y-3">
              {faqItems.map((item, index) => {
                const abierto = faqOpen === index;
                return (
                  <article key={item.q} className="fade-in-section rounded-xl border border-buscoedu-border bg-white transition-shadow duration-200 hover:shadow-lg">
                    <button
                      type="button"
                      onClick={() => setFaqOpen(abierto ? null : index)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                      aria-expanded={abierto}
                    >
                      <span className="text-sm font-semibold text-buscoedu-blue">{item.q}</span>
                      <span className="text-xl text-buscoedu-teal">{abierto ? "−" : "+"}</span>
                    </button>
                    {abierto && <p className="px-4 pb-4 text-sm leading-relaxed text-buscoedu-muted">{item.a}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* 14) FORMULARIO + CTA FINAL */}
      <div className="bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section id="form-alianza" className="fade-in-section rounded-3xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
            <h2 className="text-3xl font-bold text-buscoedu-blue">Solicitar una reunión de alianza</h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-buscoedu-muted">
              Cuéntanos tus objetivos de captación y te propondremos un modelo de colaboración acorde con tus programas, mercado y convocatoria.
            </p>

            <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
              <Input label="Nombre y apellidos" value={form.nombre_apellidos} onChange={(v) => setForm((f) => ({ ...f, nombre_apellidos: v }))} required />
              <Input label="Cargo" value={form.cargo} onChange={(v) => setForm((f) => ({ ...f, cargo: v }))} required />
              <Input label="Universidad" value={form.universidad} onChange={(v) => setForm((f) => ({ ...f, universidad: v }))} required />
              <Input label="Correo institucional" type="email" value={form.correo_institucional} onChange={(v) => setForm((f) => ({ ...f, correo_institucional: v }))} required />
              <Input label="País o mercado" value={form.pais_mercado} onChange={(v) => setForm((f) => ({ ...f, pais_mercado: v }))} required />
              <Input label="Teléfono o WhatsApp" value={form.telefono} onChange={(v) => setForm((f) => ({ ...f, telefono: v }))} required />
              <Input label="Programas prioritarios" value={form.programas_prioritarios} onChange={(v) => setForm((f) => ({ ...f, programas_prioritarios: v }))} required />
              <Input label="Modalidad que desea potenciar" value={form.modalidad_potenciar} onChange={(v) => setForm((f) => ({ ...f, modalidad_potenciar: v }))} required />

              <Input label="Matrículas objetivo (opcional)" value={form.matriculas_objetivo} onChange={(v) => setForm((f) => ({ ...f, matriculas_objetivo: v }))} />
              <Input label="Próxima convocatoria (opcional)" value={form.convocatoria_proxima} onChange={(v) => setForm((f) => ({ ...f, convocatoria_proxima: v }))} />

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-buscoedu-blue">Necesidad principal</label>
                <select
                  value={form.necesidad_principal}
                  onChange={(event) => setForm((f) => ({ ...f, necesidad_principal: event.target.value as NeedOption }))}
                  className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text"
                  required
                >
                  {[
                    "Recibir más oportunidades",
                    "Mejorar la calidad de los leads",
                    "Aumentar la conversión",
                    "Promocionar programas concretos",
                    "Activar una campaña comercial",
                    "Analizar la demanda por mercado",
                    "Explorar una alianza estratégica",
                  ].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-buscoedu-text">
                  <input
                    type="checkbox"
                    checked={form.interes_descuentos}
                    onChange={(event) => setForm((f) => ({ ...f, interes_descuentos: event.target.checked }))}
                    className="h-4 w-4 rounded border-buscoedu-border"
                  />
                  Tengo interés en activar descuentos o beneficios comerciales.
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-buscoedu-blue">Comentarios (opcional)</label>
                <textarea
                  value={form.comentarios}
                  onChange={(event) => setForm((f) => ({ ...f, comentarios: event.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text"
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-buscoedu-border bg-buscoedu-bg px-3 py-2 text-xs leading-relaxed text-buscoedu-muted">
                Al enviar este formulario autorizas el tratamiento de los datos suministrados para contacto comercial institucional relacionado con alianzas de captación educativa.
              </div>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={enviando}
                  className="rounded-lg bg-buscoedu-blue px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  {enviando ? "Enviando solicitud..." : "Solicitar una reunión de alianza"}
                </button>
              </div>

              {mensaje && (
                <p className="md:col-span-2 rounded-lg border border-buscoedu-border bg-white px-3 py-3 text-sm text-buscoedu-text">
                  {mensaje}
                </p>
              )}
            </form>
          </section>
        </div>
      </div>

      <style jsx global>{`
        .fade-in-section {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.55s ease-out, transform 0.55s ease-out;
        }
        .fade-in-section.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}

function CardSimple({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <article className="fade-in-section rounded-xl border border-buscoedu-border bg-white p-5 shadow-card transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="text-lg font-bold text-buscoedu-blue">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{texto}</p>
    </article>
  );
}

function CardNivel({ titulo, bullets }: { titulo: string; bullets: string[] }) {
  return (
    <article className="fade-in-section rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card transition-shadow duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="text-xl font-bold text-buscoedu-blue">{titulo}</h3>
      <ul className="mt-3 space-y-2 text-sm text-buscoedu-muted">
        {bullets.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-buscoedu-teal" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-buscoedu-blue">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text"
      />
    </label>
  );
}

function IconoPilar() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M12 4v16" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
