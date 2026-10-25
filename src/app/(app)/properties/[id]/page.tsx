import { PropertyScreen } from "@/components/app/PropertiesScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PropertyScreen id={decodeURIComponent(id)} />;
}
