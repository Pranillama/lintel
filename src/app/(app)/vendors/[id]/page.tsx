import { VendorScreen } from "@/components/app/VendorsScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VendorScreen id={decodeURIComponent(id)} />;
}
