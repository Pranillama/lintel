"use client";

import { useMemo } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { BillView, PortfolioResponse, ProcessBillInput, Property, Vendor, VendorAccount } from "@/types/bill";
import type { DeskActions, DeskData } from "./contract";

/** The desk, backed by Convex. Subscribes to listBills and getPortfolio; never polls. */
export function useConvexDesk(): { data: DeskData; actions: DeskActions } {
  const list = useQuery(api.bills.queries.listBills);
  const portfolio = useQuery(api.bills.queries.getPortfolio) as PortfolioResponse | undefined;
  const processBill = useAction(api.pipeline.process.processBill);
  const humanResume = useMutation(api.bills.resume.humanResume);
  const addProperty = useMutation(api.portfolio.admin.addProperty);
  const addVendor = useMutation(api.portfolio.admin.addVendor);
  const addVendorAccount = useMutation(api.portfolio.admin.addVendorAccount);

  const actions = useMemo<DeskActions>(() => {
    const run = (input: ProcessBillInput) => processBill({ input: JSON.stringify(input) }) as Promise<BillView>;
    return {
      processForm: (form) => run({ kind: "FORM", form }),
      processDocument: (document) => run({ kind: "DOCUMENT", document }),
      assign: (billId, propertyId, note) => humanResume({ billId, kind: "assign", propertyId, note }) as Promise<BillView>,
      approve: (billId, note) => humanResume({ billId, kind: "approve", note }) as Promise<BillView>,
      reject: (billId, note) => humanResume({ billId, kind: "reject", note }) as Promise<BillView>,
      sendDraft: (billId) => humanResume({ billId, kind: "send-draft" }) as Promise<BillView>,
      addProperty: (p) => addProperty({ name: p.name, street: p.street, city: p.city, state: p.state, zip: p.zip, units: p.units, contractorAutoPayLimit: p.contractor_auto_pay_limit }) as Promise<Property>,
      addVendor: (v) => addVendor({ name: v.name, aliases: v.aliases, kind: v.kind, utilityType: v.utility_type }) as Promise<Vendor>,
      addAccount: (a) => addVendorAccount({ vendorId: a.vendor_id, propertyId: a.property_id, accountNumber: a.account_number, usageUnit: a.usage_unit }) as Promise<VendorAccount>,
    };
  }, [processBill, humanResume, addProperty, addVendor, addVendorAccount]);

  const data: DeskData = {
    bills: (list?.bills ?? []) as BillView[],
    totals: list?.totals,
    auditChainIntact: list?.audit_chain_intact ?? true,
    portfolio,
    loading: list === undefined,
  };
  return { data, actions };
}

/** A bill's original uploaded file (URL, content type, filename); null for typed and feed bills, undefined while loading. */
export function useBillDocument(billId: string) {
  return useQuery(api.bills.queries.getBillDocument, { billId });
}
