import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { editorMedia } from "@/lib/admin/media";
import { getTeamMemberForEdit } from "@/lib/admin/team";
import { AdminForm } from "@/components/admin/AdminForm";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { blocksToMarkup } from "@/lib/content/markup";
import {
  deleteTeamMemberAction,
  deleteTeamMemberTextAction,
  saveTeamMemberTextAction,
  updateTeamMemberAction,
} from "../actions";
import { teamMemberFields } from "../fields";

export const metadata: Metadata = { title: "Team member" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function TeamMemberPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale: Locale = pickLocale(q.lang);
  const [data, { library }, editor] = await Promise.all([
    getTeamMemberForEdit(id),
    editorMedia("en"),
    editorMedia(locale),
  ]);
  if (!data) notFound();
  const { member, translations } = data;
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  const en = translations.find((t) => t.locale === "en");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/team", label: "Team" }}
        title={en?.name ?? row?.name ?? "Team member"}
        description={member.status === "published" ? "Published" : "Draft: not on the site yet"}
        actions={
          member.status === "published" && row ? (
            <ButtonLink variant="secondary" href={`/${locale}/team`}>
              View Team page
            </ButtonLink>
          ) : null
        }
      />
      {q.created ? (
        <Alert tone="success" live="polite">
          <p>Team member added. Now write their name, designation and details in each language.</p>
        </Alert>
      ) : null}
      <AdminForm
        id="team-member"
        action={updateTeamMemberAction.bind(null, id)}
        submitLabel="Save settings"
        sections={[{ title: "Settings", fields: teamMemberFields(member, library) }]}
      />

      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Text in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/team/${id}?lang=${l}`}
          current={locale}
          states={
            Object.fromEntries(
              routing.locales.map((l) => [l, translationState(translations.find((t) => t.locale === l))]),
            ) as Record<Locale, ReturnType<typeof translationState>>
          }
        />
        {q.removed ? (
          <Alert tone="success" live="polite">
            <p>The {lang.name} text was removed.</p>
          </Alert>
        ) : null}
        {!row && locale !== "en" ? (
          <Alert tone="info">
            <p>
              No {lang.name} text yet. Write it in {lang.name}; until then this member doesn&apos;t show in{" "}
              {lang.name}.
            </p>
          </Alert>
        ) : null}
        <AdminForm
          key={locale}
          id="team-member-text"
          action={saveTeamMemberTextAction.bind(null, id, locale)}
          submitLabel="Save text"
          sticky
          sections={[
            {
              title: "Person",
              fields: [
                {
                  name: "name",
                  label: "Name",
                  required: true,
                  lang: locale,
                  maxLength: 120,
                  defaultValue: row?.name ?? "",
                },
                {
                  name: "designation",
                  label: "Designation",
                  required: true,
                  lang: locale,
                  maxLength: 120,
                  defaultValue: row?.designation ?? "",
                  hint: "e.g. Managing Trustee, Treasurer, Programme Coordinator.",
                },
                {
                  name: "bio",
                  label: "Details",
                  type: "blocks",
                  lang: locale,
                  defaultValue: blocksToMarkup(row?.bio ?? []),
                  editor,
                },
              ],
            },
            {
              title: "Review",
              description: "Production shows this language only after a person has checked the text.",
              fields: [
                {
                  name: "reviewed",
                  label: "Reviewed by a person: publish in this language",
                  type: "checkbox",
                  defaultValue: row?.reviewedAt ? "on" : "",
                },
              ],
            },
          ]}
        />
      </section>

      {row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`The member then doesn't appear in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteTeamMemberTextAction.bind(null, id, locale)}
              submitLabel={`Remove ${lang.name} text`}
              variant="danger"
              confirm={`Remove the ${lang.name} text of this member?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      <Card>
        <Section id="delete" title="Delete member" description="Removes them in every language.">
          <AdminForm
            id="delete-member"
            action={deleteTeamMemberAction.bind(null, id)}
            submitLabel="Delete member"
            variant="danger"
            confirm="Delete this team member and all their text?"
            fields={[]}
          />
        </Section>
      </Card>
    </>
  );
}
