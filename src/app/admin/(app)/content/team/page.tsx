import type { Metadata } from "next";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { requireCapability } from "@/lib/admin/guard";
import { listTeamMembers } from "@/lib/admin/team";
import { DataTable, PageHeader, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Team" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function TeamPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listTeamMembers(), searchParams]);
  return (
    <>
      <PageHeader
        title="Team"
        description="Board members and team. Everyone published is on the Team page (/team) in each language they're written in; members ticked “Show on About” are also on About."
        actions={<ButtonLink href="/admin/content/team/new">Add member</ButtonLink>}
      />
      {q.deleted ? (
        <Alert tone="success" live="polite">
          <p>Team member deleted.</p>
        </Alert>
      ) : null}
      <DataTable caption="Team members">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Designation</Th>
            <Th>Status</Th>
            <Th>About</Th>
            <Th>Languages</Th>
            <Th align="right">Order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                No team members yet.
              </td>
            </tr>
          ) : (
            rows.map((m) => {
              const shown = m.translations.find((x) => x.locale === "en") ?? m.translations[0];
              return (
                <Tr key={m.id}>
                  <Td header>
                    <Link
                      href={`/admin/content/team/${m.id}`}
                      className="text-link-default underline underline-offset-4"
                    >
                      {shown?.name ?? "Untitled member"}
                    </Link>
                  </Td>
                  <Td>{shown?.designation ?? ""}</Td>
                  <Td>
                    <Badge tone={m.status === "published" ? "success" : "neutral"}>
                      {m.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </Td>
                  <Td>{m.showOnAbout ? "Yes" : "No"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {routing.locales.map((l) => {
                        const x = m.translations.find((y) => y.locale === l);
                        return x ? (
                          <Badge key={l} tone={x.reviewedAt ? "success" : "warning"}>
                            {l.toUpperCase()}
                            <span className="sr-only">{x.reviewedAt ? " reviewed" : " draft"}</span>
                          </Badge>
                        ) : null;
                      })}
                    </span>
                  </Td>
                  <Td align="right">{m.sortOrder}</Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </DataTable>
    </>
  );
}
