import { BillScreen } from "@/components/app/BillScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillScreen id={decodeURIComponent(id)} />;
}
