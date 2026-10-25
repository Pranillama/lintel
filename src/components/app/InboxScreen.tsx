"use client";

import { Screen, ScreenHeader } from "./kit";

export function InboxScreen({ status, upload }: { status?: string; upload: boolean }) {
  return <Screen><ScreenHeader title="Inbox" sub={upload ? "Upload" : status} /></Screen>;
}
