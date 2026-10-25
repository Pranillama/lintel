"use client";

import { Screen, ScreenHeader } from "./kit";

export function VendorsScreen() {
  return <Screen><ScreenHeader title="Vendors" /></Screen>;
}

export function VendorScreen({ id }: { id: string }) {
  return <Screen><ScreenHeader title={id} back={{ href: "/vendors", label: "Vendors" }} /></Screen>;
}
