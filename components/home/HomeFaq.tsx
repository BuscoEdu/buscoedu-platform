import FaqAccordion from "@/components/restyle/FaqAccordion";
import SectionBand from "@/components/restyle/SectionBand";
import SectionWrap from "@/components/restyle/SectionWrap";

/**
 * Preguntas que el criterio H6 pide responder en el Home.
 * Copy en tuteo: gratis, sin contacto sin permiso, explorar sin registro, qué es NaIA.
 */

const PREGUNTAS = [
  {
    id: "costo",
    pregunta: "¿Tiene costo para mí?",
    respuesta: "No. BuscoEdu es gratis para estudiantes. No pagas por explorar, comparar ni aplicar."
  },
  {
    id: "permiso",
    pregunta: "¿Me van a contactar sin permiso?",
    respuesta:
      "No. La universidad solo recibe tus datos si tú autorizas el contacto. Guardar en Mi lista no envía tus datos, y aplicar tampoco autoriza ese contacto: son pasos distintos."
  },
  {
    id: "registro",
    pregunta: "¿Necesito registrarme para explorar?",
    respuesta: "No. Puedes ver el catálogo y filtrarlo sin registrarte."
  },
  {
    id: "naia",
    pregunta: "¿Qué es NaIA?",
    respuesta:
      "NaIA te orienta para explorar, comparar o aplicar. Responde solo con programas del catálogo vigente y trata a las universidades por igual: no te dice cuál es la mejor."
  }
];

export default function HomeFaq() {
  return (
    <SectionBand>
      {/*
        En 390 el FAB (minimizar + pastilla NaIA) tapa el «+» del ítem
        «¿Qué es NaIA?» a media página. El margen derecho va en un envoltorio
        sin px propio, para que no compita con el padding de SectionWrap.
        a2-fab-safe deja aire abajo del último ítem.
      */}
      <SectionWrap narrow className="a2-fab-safe md:pb-[60px]">
        <h2 className="text-center font-display text-[34px] leading-[1.02] text-[var(--color-primary)] sm:text-[48px]">
          Preguntas frecuentes
        </h2>
        <div className="max-md:pr-36">
          <FaqAccordion items={PREGUNTAS} />
        </div>
      </SectionWrap>
    </SectionBand>
  );
}
