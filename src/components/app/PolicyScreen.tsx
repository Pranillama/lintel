"use client";

/**
 * Policy, read-only: what gets paid on its own, what waits for a person, what is never
 * paid, and who approves. Numbers come from POLICY (the same constants the engine runs);
 * the exact rule text comes from getPortfolio.
 */
import { formatUsd } from "@/engine/format";
import { POLICY } from "@/seed/policy";
import { CARD, Icon, T } from "../desk/ui";
import { useApp } from "./AppProvider";
import { Loading, Screen, ScreenHeader } from "./kit";

const COLUMNS: Array<{ title: string; tone: string; icon: "check" | "alert" | "x"; rules: string[] }> = [
  {
    title: "Paid on its own",
    tone: "text-ok",
    icon: "check",
    rules: [
      "A utility bill whose account number matches a property exactly.",
      `Usage and amount within +${POLICY.SPIKE_THRESHOLD_PCT}% of the last ${POLICY.BASELINE_BILLS} bills.`,
      "A known contractor at or under the property's auto-pay limit.",
    ],
  },
  {
    title: "Waits for a person",
    tone: "text-lime",
    icon: "alert",
    rules: [
      `Usage or amount more than +${POLICY.SPIKE_THRESHOLD_PCT}% over usual.`,
      `A field Lintel isn't sure it read right (below ${POLICY.MIN_FIELD_CONFIDENCE.toFixed(2)}).`,
      "A property Lintel can't match with confidence, or a vendor it doesn't know.",
      "A contractor over the auto-pay limit, or not verified yet.",
    ],
  },
  {
    title: "Never paid",
    tone: "text-bad",
    icon: "x",
    rules: [
      "The same invoice from the same vendor, at any time.",
      `The same vendor, property and amount (within ${POLICY.FUZZY_DUP_AMOUNT_PCT}%) due within ${POLICY.FUZZY_DUP_WINDOW_DAYS} days.`,
      "Line items that don't add up to the printed total.",
      "A vendor flagged by the identity check.",
    ],
  },
];

export function PolicyScreen() {
  const { data } = useApp();
  const p = data.portfolio;
  return (
    <Screen>
      <ScreenHeader title="Policy" sub="Read-only. These are the same numbers Lintel's rules run on; changing them is a code change, reviewed like one." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((c) => (
          <section key={c.title} className={`${CARD} flex flex-col gap-3`}>
            <h2 className={`${T.body} flex items-center gap-2 font-semibold ${c.tone}`}><Icon name={c.icon} /> {c.title}</h2>
            <ul className="flex flex-col">
              {c.rules.map((r) => <li key={r} className={`${T.small} border-t border-white/[0.08] py-2.5 first:border-t-0`}>{r}</li>)}
            </ul>
          </section>
        ))}
      </div>

      <section className={`${CARD} flex flex-col gap-4`}>
        <h2 className={`${T.body} font-semibold`}>Who approves a held bill</h2>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Rung who="Operator" when="Lintel can't tell what the bill is: an unsure read, an unmatched property or vendor, a utility not matched by account." />
          <Rung who="Property Manager" when={`A vendor that isn't verified, or a spike or over-limit bill up to ${formatUsd(POLICY.VP_FINANCE_ABOVE_USD)}.`} />
          <Rung who="VP Finance" when={`A spike or over-limit bill above ${formatUsd(POLICY.VP_FINANCE_ABOVE_USD)}.`} />
        </ol>
        <p className={`${T.small} text-muted`}>The AI reads bills and drafts follow-ups. It can&apos;t approve, pay, or change a bill.</p>
      </section>

      {!p ? <Loading rows={2} /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className={`${CARD} flex flex-col`}>
            <h2 className={`${T.label} pb-2 text-muted`}>Contractor auto-pay limit by property</h2>
            {p.properties.length === 0 && <p className={`${T.small} text-muted`}>No properties saved yet.</p>}
            {p.properties.map((x) => (
              <div key={x.id} className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] py-2.5">
                <span className={T.small}>{x.name}</span>
                <span className={`${T.small} font-semibold tabular-nums`}>{formatUsd(x.contractor_auto_pay_limit)}</span>
              </div>
            ))}
          </section>
          <details className={`${CARD} group h-fit`}>
            <summary className={`${T.label} flex cursor-pointer list-none items-center gap-2 text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-paper`}>
              <Icon name="chevron" className="-rotate-90 transition-transform group-open:rotate-0" /> The rules as written · {p.policy_text.length}
            </summary>
            <ol className="mt-3 flex flex-col">
              {p.policy_text.map((rule, i) => (
                <li key={i} className="grid grid-cols-[24px_1fr] gap-3 border-t border-white/[0.08] py-2.5">
                  <span className="font-mono text-[12px] font-semibold leading-5 text-muted">{i + 1}</span>
                  <span className={T.small}>{rule}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </Screen>
  );
}

function Rung({ who, when }: { who: string; when: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-[10px] bg-bar p-4">
      <span className={`${T.body} font-semibold`}>{who}</span>
      <span className={`${T.small} text-muted`}>{when}</span>
    </li>
  );
}
