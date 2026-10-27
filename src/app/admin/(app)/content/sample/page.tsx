import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { sampleCounts } from "@/lib/admin/sample";
import { isProduction } from "@/lib/content/source";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, Details, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { loadSampleAction, removeSampleAction } from "./actions";

export const metadata: Metadata = { title: "Sample content" };
// Downloading and resizing the sample photos takes a while.
export const maxDuration = 300;

export default async function SampleContentPage() {
  await requireCapability("content.sample");
  const counts = await sampleCounts();
  const any = Object.values(counts).some((n) => n > 0);
  return (
    <>
      <PageHeader
        title="Sample content"
        description="Example causes, events, news, a gallery album and documents with sample photos, so every page can be tried and edited in the admin."
      />
      {isProduction() ? (
        <Alert tone="warning">
          <p>
            This is the live site. Sample items are added as drafts that visitors don’t see until someone
            marks a language reviewed. Page header photos are not added here.
          </p>
        </Alert>
      ) : null}
      <Card>
        <Section
          id="now"
          title="In the database now"
          description="Items created by this tool and still present."
        >
          <Details
            items={[
              { label: "Causes", value: String(counts.causes) },
              { label: "Events", value: String(counts.events) },
              { label: "News posts", value: String(counts.news) },
              { label: "Albums", value: String(counts.albums) },
              { label: "Documents", value: String(counts.documents) },
              { label: "Sample photos", value: String(counts.photos) },
            ]}
          />
        </Section>
        <Section
          id="load"
          title="Load sample content"
          description="Downloads 20 free sample photos (Lorem Picsum) and creates the sample items as unreviewed drafts. Items whose web address already exists are skipped, so it's safe to run again. Takes up to a minute."
        >
          <AdminForm
            id="load-sample"
            action={loadSampleAction}
            submitLabel="Load sample content"
            pendingLabel="Loading… (downloading photos)"
            fields={[]}
          />
        </Section>
        {any ? (
          <Section
            id="remove"
            title="Remove sample content"
            description="Deletes sample items nobody has approved (and causes without donations), then the sample photos no longer used anywhere."
          >
            <AdminForm
              id="remove-sample"
              action={removeSampleAction}
              submitLabel="Remove sample content"
              variant="danger"
              confirm="Remove the sample content? Items someone has approved are kept."
              fields={[]}
            />
          </Section>
        ) : null}
      </Card>
    </>
  );
}
