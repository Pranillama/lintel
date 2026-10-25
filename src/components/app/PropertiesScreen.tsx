"use client";

import { Screen, ScreenHeader } from "./kit";

export function PropertiesScreen() {
  return <Screen><ScreenHeader title="Properties" /></Screen>;
}

export function PropertyScreen({ id }: { id: string }) {
  return <Screen><ScreenHeader title={id} back={{ href: "/properties", label: "Properties" }} /></Screen>;
}
