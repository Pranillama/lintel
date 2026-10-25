"use client";

import { useMemo } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { BillView, PortfolioResponse, ProcessBillInput } from "@/types/bill";
import type { DeskActions, DeskData } from "./desk";

/** The desk, backed by Convex. Subscribes to listBills and getPortfolio; never polls. */
export function useConvexDesk(): { data: DeskData; actions: DeskActions } {
  const list = useQuery(api.bills.queries.listBills);
  const portfolio = useQuery(api.bills.queries.getPortfolio) as PortfolioResponse | undefined;
  const processBill = useAction(api.pipeline.process.processBill);
  const replayOpening = useAction(api.pipeline.process.replayOpening);
  const humanResume = useMutation(api.bills.resume.humanResume);

  const actions = useMemo<DeskActions>(() => {
    const run = (input: ProcessBillInput) => processBill({ input: JSON.stringify(input) }) as Promise<BillView>;
    return {
      async replay() { return (await replayOpening({})).bills as BillView[]; },
      processForm: (form) => run({ kind: "FORM", form }),
      processDocument: (document) => run({ kind: "DOCUMENT", document }),
      assign: (billId, propertyId, note) => humanResume({ billId, kind: "assign", propertyId, note }) as Promise<BillView>,
      approve: (billId, note) => humanResume({ billId, kind: "approve", note }) as Promise<BillView>,
      reject: (billId, note) => humanResume({ billId, kind: "reject", note }) as Promise<BillView>,
      sendDraft: (billId) => humanResume({ billId, kind: "send-draft" }) as Promise<BillView>,
    };
  }, [processBill, replayOpening, humanResume]);

  const data: DeskData = {
    bills: (list?.bills ?? []) as BillView[],
    totals: list?.totals,
    auditChainIntact: list?.audit_chain_intact ?? true,
    portfolio,
    loading: list === undefined,
  };
  return { data, actions };
}
