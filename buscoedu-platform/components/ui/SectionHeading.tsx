type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
};

export default function SectionHeading({ eyebrow, title, description, centered = false }: Props) {
  return (
    <div className={centered ? "mx-auto mb-8 max-w-3xl text-center" : "mb-8 max-w-3xl"}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-buscoedu-teal">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl font-bold text-buscoedu-blue sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-base leading-relaxed text-buscoedu-muted">{description}</p>}
    </div>
  );
}
