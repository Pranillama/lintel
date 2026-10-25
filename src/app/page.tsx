import { redirect } from "next/navigation";
import { Landing } from "@/components/app/Landing";

type Search = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // Old desk links (`/?panel=test`, `/?bill=`) land in the inbox.
  if (sp.panel === "test") redirect("/inbox?upload=1");
  if (sp.bill) redirect("/inbox");
  return <Landing />;
}
