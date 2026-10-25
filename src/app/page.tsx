import { LiveDesk } from "@/components/desk/LiveDesk";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return <LiveDesk hints={{ bill: one(sp.bill), panel: one(sp.panel) }} />;
}
