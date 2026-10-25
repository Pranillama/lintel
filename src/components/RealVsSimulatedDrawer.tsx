import type { PortfolioResponse } from "@/types/bill";
import type { PortfolioDrawerProps } from "./desk";

type RowStatus = PortfolioResponse["real_vs_simulated"][number]["status"];

const TAG: Record<RowStatus, { label: string; className: string }> = {
  REAL: { label: "Real", className: "text-paper shadow-[inset_0_0_0_1.5px_currentColor]" },
  SEEDED: { label: "Seeded", className: "bg-raised text-muted" },
  SIMULATED: { label: "Simulated", className: "border-[1.5px] border-dashed border-muted text-muted" },
};

const TAG_BASE = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold";

/** What is live vs seeded vs simulated, exactly as getPortfolio returns it. */
export function RealVsSimulatedDrawer({ onClose, portfolio }: PortfolioDrawerProps) {
  const flags = portfolio
    ? [
        { label: "Extraction", on: portfolio.flags.extraction_enabled },
        { label: "CREAO", on: portfolio.flags.creao_enabled },
        { label: "CRS", on: portfolio.flags.crs_enabled },
        { label: "x402", on: portfolio.flags.x402_enabled },
      ]
    : [];

  return (
    <section
      role="dialog"
      aria-labelledby="rvs-title"
      className="card h-full w-full overflow-y-auto border border-raised px-[34px] py-[30px]"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="rvs-title" className="text-[32px] font-medium leading-tight tracking-[-0.01em]">
            Real vs. simulated
          </h2>
          <p className="mt-2 text-[15px] text-muted">What runs live in the demo, and how you can check it.</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="focus-ring grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-paper hover:bg-raised"
        >
          ✕
        </button>
      </header>

      {portfolio ? (
        <>
          <ul className="flex flex-col">
            {portfolio.real_vs_simulated.map((row) => {
              const tag = TAG[row.status];
              return (
                <li key={row.component} className="flex items-center justify-between gap-6 border-b border-raised py-3">
                  <div className="min-w-0">
                    <p className="text-[15px]">{row.component}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{row.how_to_verify}</p>
                  </div>
                  <span className={`${TAG_BASE} ${tag.className}`}>{tag.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="mr-2 text-[14px] text-muted">Feature flags</span>
            {flags.map((f) => (
              <span
                key={f.label}
                className={`${TAG_BASE} ${f.on ? "text-paper shadow-[inset_0_0_0_1.5px_currentColor]" : "text-muted shadow-[inset_0_0_0_1.5px_var(--color-raised)]"}`}
              >
                {f.label} · {f.on ? "on" : "off"}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div aria-busy="true" aria-label="Loading components" className="flex animate-pulse flex-col gap-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-5 rounded-full bg-raised" style={{ width: `${88 - (i % 3) * 12}%` }} />
          ))}
        </div>
      )}
    </section>
  );
}
