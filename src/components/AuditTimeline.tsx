import type { AuditAction, AuditEvent, CheckId } from "@/types/bill";
import { ActorChip } from "./ActorChip";
import { CheckMark } from "./CheckMark";
import { CHECK_LABEL } from "./desk";

const ACTION_LABEL: Record<AuditAction, string> = {
  INTAKE: "Bill received",
  EXTRACT_FIELDS: "Fields read",
  RESOLVE_VENDOR: "Vendor resolved",
  RESOLVE_PROPERTY: "Property resolved",
  CHECK: "Check",
  VERIFY_VENDOR: "Vendor verified",
  DECISION: "Decision",
  ROUTE_PAYMENT: "Payment routed",
  INVESTIGATION_STARTED: "Investigator started",
  INVESTIGATION_COMPLETED: "Investigator finished",
  INVESTIGATION_FAILED: "Investigator failed",
  HUMAN_ASSIGN_PROPERTY: "Property assigned",
  ALIAS_STORED: "Address alias stored",
  HUMAN_APPROVE: "Approved",
  HUMAN_REJECT: "Rejected",
  DRAFT_SENT: "Draft sent",
};

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function actionText(event: AuditEvent): string {
  const checkId = event.data.check_id;
  if (event.action === "CHECK" && typeof checkId === "string" && checkId in CHECK_LABEL) {
    return `${CHECK_LABEL[checkId as CheckId]} check`;
  }
  return ACTION_LABEL[event.action];
}

/** The bill's hash-chained audit rows in seq order. Scrolls inside its card. */
export function AuditTimeline({ events, auditChainIntact }: { events: AuditEvent[]; auditChainIntact: boolean }) {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {ordered.length === 0 && <p className="text-[13px] text-muted">No audit rows yet.</p>}
      <ol className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {ordered.map((event) => (
          <li key={event.id} className="flex min-w-0 items-start gap-2.5">
            <CheckMark outcome={event.decision} className="mt-0.5 size-6! rounded-lg! text-[11px]!" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2 text-[13px]">
                <time dateTime={event.ts} className="shrink-0 tabular-nums text-muted">{TIME.format(new Date(event.ts))}</time>
                <ActorChip actor={event.actor} />
                <span className="truncate font-medium">{actionText(event)}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted" title={event.hash}>{event.hash.slice(0, 8)}</span>
              </div>
              <p title={event.rationale} className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{event.rationale}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="label-mono shrink-0 text-muted">{auditChainIntact ? "chain ✓ intact" : "chain ✗ broken"}</p>
    </div>
  );
}
