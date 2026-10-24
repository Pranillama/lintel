import { formatUsd } from "@/engine/format";
import type { PortfolioDrawerProps } from "./desk";

/** Read-only policy text and contractor limits, exactly as getPortfolio returns them. */
export function PolicyDrawer({ onClose, portfolio }: PortfolioDrawerProps) {
  return (
    <section
      role="dialog"
      aria-labelledby="policy-title"
      className="card h-full w-full overflow-y-auto border border-raised px-[34px] py-[30px]"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="policy-title" className="text-[32px] font-medium leading-tight tracking-[-0.01em]">
            Policy
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            Read-only at this desk. Text comes from the same constants the engine runs.
          </p>
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
        <div className="flex items-start gap-8">
          <ol className="flex min-w-0 flex-1 flex-col gap-4">
            {portfolio.policy_text.map((rule, i) => (
              <li key={i} className="flex gap-5 text-[15px] leading-relaxed">
                <span aria-hidden="true" className="w-4 shrink-0 text-[20px] leading-snug text-lime">
                  {i + 1}
                </span>
                <span className="min-w-0">{rule}</span>
              </li>
            ))}
          </ol>
          <div className="w-[300px] shrink-0 rounded-[22px] bg-raised px-5 py-4">
            <h3 className="mb-2 text-[15px] font-semibold">Contractor auto-pay limits</h3>
            <dl className="flex flex-col">
              {portfolio.properties.map((p) => (
                <div key={p.id} className="flex justify-between gap-4 py-2 text-[14px]">
                  <dt className="min-w-0 truncate">{p.name}</dt>
                  <dd className="tabular-nums">{formatUsd(p.contractor_auto_pay_limit)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : (
        <div aria-busy="true" aria-label="Loading policy" className="flex animate-pulse flex-col gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-5 rounded-full bg-raised" style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
      )}
    </section>
  );
}
