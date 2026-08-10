type Props = {
  title: string;
  description: string;
};

export default function InfoCard({ title, description }: Props) {
  return (
    <article className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
      <h3 className="text-lg font-semibold text-buscoedu-blue">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{description}</p>
    </article>
  );
}
