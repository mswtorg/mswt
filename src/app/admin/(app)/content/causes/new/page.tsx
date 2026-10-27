import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { createCauseAction } from "../actions";
import { causeFields } from "../fields";

export const metadata: Metadata = { title: "New cause" };

export default async function NewCausePage() {
  await requireCapability("causes.write");
  const { library } = await editorMedia("en");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/causes", label: "Causes" }}
        title="New cause"
        description="Start with the settings; you write the text in each language next."
      />
      <AdminForm
        id="cause"
        action={createCauseAction}
        submitLabel="Create cause"
        sections={[{ title: "Settings", fields: causeFields({}, library, false) }]}
      />
    </>
  );
}
