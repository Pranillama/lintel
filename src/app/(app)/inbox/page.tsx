import { InboxScreen } from "@/components/app/InboxScreen";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return <InboxScreen status={one(sp.status)} upload={one(sp.upload) === "1"} />;
}
