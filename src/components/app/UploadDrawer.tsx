"use client";

import { useRouter } from "next/navigation";
import { TestBill } from "../desk/TestBill";
import { useApp } from "./AppProvider";

export function UploadDrawer({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const { data, actions } = useApp();
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex justify-end bg-bar/70 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <TestBill className="h-full w-[560px] max-w-full" actions={actions} bills={data.bills} onClose={onClose}
        onLanded={() => undefined} onView={(b) => { onClose(); router.push(`/bills/${encodeURIComponent(b.id)}`); }} />
    </div>
  );
}
