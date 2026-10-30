import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { createTeamMemberAction } from "../actions";
import { teamMemberFields } from "../fields";

export const metadata: Metadata = { title: "New team member" };

export default async function NewTeamMemberPage() {
  await requireCapability("cms.write");
  const { library } = await editorMedia("en");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/team", label: "Team" }}
        title="New team member"
        description="Start with the settings; you write the name, designation and details in each language next."
      />
      <AdminForm
        id="team-member"
        action={createTeamMemberAction}
        submitLabel="Add member"
        sections={[{ title: "Settings", fields: teamMemberFields({}, library) }]}
      />
    </>
  );
}
