"use client";

import { Screen, ScreenHeader } from "./kit";

export function BillScreen({ id }: { id: string }) {
  return <Screen><ScreenHeader title={id} /></Screen>;
}
