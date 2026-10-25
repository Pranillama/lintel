import type { BlotterTab, DrawerKind, HeaderBarProps } from "./desk";

const TABS: { id: BlotterTab; label: string }[] = [
  { id: "all", label: "All bills" },
  { id: "held", label: "Needs you" },
  { id: "blocked", label: "Blocked" },
  { id: "cleared", label: "Cleared" },
  { id: "live", label: "Live" },
];

const DRAWERS: { id: Exclude<DrawerKind, "judge">; label: string }[] = [
  { id: "policy", label: "Policy" },
  { id: "rvs", label: "Real vs simulated" },
];

// Tighter pills below 1400px so the row fits at 1280.
const PILL_PAD = "px-[18px] min-[1400px]:px-6";

export function HeaderBar({ tab, onTab, counts, seatsLine, propertiesLoaded, openDrawer, onOpenDrawer }: HeaderBarProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div aria-hidden className="mr-1 flex size-[54px] flex-none items-center justify-center rounded-full bg-paper text-[20px] font-semibold text-bar">
          L
        </div>
        <nav aria-label="Filter bills" className="flex items-center gap-2.5">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onTab(t.id)}
                className={`pill ${on ? "pill-on" : ""} ${PILL_PAD} cursor-pointer`}
              >
                {t.label}
                <span className={`ml-2 text-[12px] tabular-nums ${on ? "opacity-50" : "text-muted"}`}>{counts[t.id]}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex-1" />
        {DRAWERS.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-expanded={openDrawer === d.id}
            onClick={() => onOpenDrawer(d.id)}
            className={`pill ${PILL_PAD} cursor-pointer bg-transparent ${
              openDrawer === d.id ? "shadow-[inset_0_0_0_1.5px_var(--color-paper)]" : "shadow-[inset_0_0_0_1.5px_var(--color-raised)]"
            }`}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={openDrawer === "judge"}
          aria-keyshortcuts="j"
          onClick={() => onOpenDrawer("judge")}
          className={`btn btn-lime ${PILL_PAD}`}
        >
          ＋ Test a bill
          <kbd className="ml-2.5 font-mono text-[12px] font-semibold opacity-50">J</kbd>
        </button>
      </div>
      <div className="flex items-center gap-2 pl-16 text-[13px]">
        <span className="flex-none text-paper">AI reads · CODE decides · HUMAN owns</span>
        {seatsLine !== undefined && (
          <>
            <span aria-hidden className="flex-none text-muted">—</span>
            <span className="min-w-0 truncate text-muted">{seatsLine}</span>
          </>
        )}
        <span className="ml-auto flex-none pl-4 text-muted tabular-nums">250-property book · {propertiesLoaded} loaded</span>
      </div>
    </header>
  );
}
