import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { saveDocumentAction } from "../actions";
import { documentSections } from "../fields";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage() {
  await requireCapability("cms.write");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/documents", label: "Documents" }}
        title="New document"
        description="Then upload the PDF and add its title in each language."
      />
      <AdminForm
        id="document"
        action={saveDocumentAction.bind(null, null)}
        submitLabel="Create document"
        sections={documentSections(null)}
      />
    </>
  );
}
