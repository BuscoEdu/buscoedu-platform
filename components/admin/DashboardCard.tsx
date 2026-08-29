type DashboardCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
};

export default function DashboardCard({ title, value, subtitle }: DashboardCardProps) {
  return (
    <article className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
      <p className="text-sm font-medium text-buscoedu-muted">{title}</p>
      <p className="mt-2 text-3xl font-bold text-buscoedu-blue">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-buscoedu-muted">{subtitle}</p> : null}
    </article>
  );
}
