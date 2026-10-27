import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { NewItem } from "../../ItemPages";

export const metadata: Metadata = { title: "New post" };

export default async function NewNewsPage() {
  await requireCapability("cms.write");
  const { library } = await editorMedia("en");
  return <NewItem kind="news" library={library} />;
}
