import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { saveAlbumAction } from "../actions";
import { albumSections } from "../fields";

export const metadata: Metadata = { title: "New album" };

export default async function NewAlbumPage() {
  await requireCapability("cms.write");
  const { library } = await editorMedia("en");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/gallery", label: "Gallery" }}
        title="New album"
        description="Choose the photos; you add the title in each language next."
      />
      <AdminForm
        id="album"
        action={saveAlbumAction.bind(null, null)}
        submitLabel="Create album"
        sections={albumSections(null, [], library)}
      />
    </>
  );
}
