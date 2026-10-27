import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { NewItem } from "../../ItemPages";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventsPage() {
  await requireCapability("cms.write");
  const { library } = await editorMedia("en");
  return <NewItem kind="events" library={library} />;
}
