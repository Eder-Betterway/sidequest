"use client";

export type TabId = "trips" | "plan" | "notes" | "ask";

export const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "trips",
    label: "Trips",
    icon: (
      <path d="M4 19c0-5 4-6 8-9s5-6 8-6M4 19h4M18 4h2v2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    id: "plan",
    label: "Plan",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    icon: <path d="M6 4h9l3 3v13H6zM9 10h6M9 14h6M9 18h3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    id: "ask",
    label: "Ask",
    icon: (
      <path
        d="M5 18l-1 3 4-2c1.2.6 2.6 1 4 1 4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7c0 1.8.7 3.5 2 4.8z"
        strokeLinejoin="round"
      />
    ),
  },
];

/** Bottom tab bar. Big tap targets, thumb-reachable, clears the iPhone home bar. */
export default function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <nav className="pb-safe border-t border-border bg-surface" aria-label="Main">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  on ? "text-accent" : "text-muted"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  {t.icon}
                </svg>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
