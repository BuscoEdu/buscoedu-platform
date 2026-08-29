'use client';

export type TabItem = {
  id: string;
  label: string;
  badge?: string;
};

type TabsProps = {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
};

export default function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="inline-flex min-w-full gap-2 rounded-xl border border-buscoedu-border bg-white p-1.5 shadow-card">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:flex-none sm:px-4 ${
                isActive
                  ? 'bg-buscoedu-blue text-white'
                  : 'text-buscoedu-text hover:bg-buscoedu-bg hover:text-buscoedu-blue'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isActive ? 'bg-white/20 text-white' : 'bg-buscoedu-bg text-buscoedu-muted'
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
