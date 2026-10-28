import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { createTestimonialAction } from "../actions";
import { testimonialFields } from "../fields";

export const metadata: Metadata = { title: "New testimonial" };

export default async function NewTestimonialPage() {
  await requireCapability("cms.write");
  const { library } = await editorMedia("en");
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/testimonials", label: "Testimonials" }}
        title="New testimonial"
        description="Start with the settings; you write the quote in each language next."
      />
      <AdminForm
        id="testimonial"
        action={createTestimonialAction}
        submitLabel="Create testimonial"
        sections={[{ title: "Settings", fields: testimonialFields({}, library) }]}
      />
    </>
  );
}
