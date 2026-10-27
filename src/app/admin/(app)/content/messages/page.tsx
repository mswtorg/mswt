import type { Metadata } from "next";
import Link from "next/link";
import { istDateTime } from "@/lib/admin/format";
import { requireCapability } from "@/lib/admin/guard";
import {
  assignees,
  listMessages,
  MESSAGE_LABEL,
  MESSAGE_PAGE_SIZE,
  MESSAGE_STATUSES,
  MESSAGE_TONE,
  parseMessageFilters,
} from "@/lib/admin/messages";
import {
  compactControl,
  DataTable,
  FilterBar,
  FilterField,
  PageHeader,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Messages" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function MessagesPage({ searchParams }: Props) {
  await requireCapability("messages.read");
  const q = await searchParams;
  const f = parseMessageFilters(q);
  const [{ rows, total }, people] = await Promise.all([listMessages(f), assignees()]);
  const page = f.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  const link = (p: number) =>
    `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;
  return (
    <>
      <PageHeader
        title="Messages"
        description="Sent through the contact form. Kept until an admin deletes them."
      />
      {q.deleted ? (
        <Alert tone="success" live="polite">
          <p>Message deleted.</p>
        </Alert>
      ) : null}
      <FilterBar resetHref="/admin/content/messages">
        <FilterField id="m-status" label="Status">
          <select id="m-status" name="status" defaultValue={f.status ?? ""} className={compactControl}>
            <option value="">All</option>
            {MESSAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MESSAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField id="m-assignee" label="Assigned to">
          <select id="m-assignee" name="assignee" defaultValue={f.assignee ?? ""} className={compactControl}>
            <option value="">Anyone</option>
            <option value="none">Nobody</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField id="m-q" label="Search" wide>
          <input
            id="m-q"
            name="q"
            type="search"
            defaultValue={f.q}
            placeholder="Name, email or subject"
            className={compactControl}
          />
        </FilterField>
      </FilterBar>
      <DataTable
        caption="Messages"
        footer={
          <nav aria-label="Message pages" className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-fg-muted">
              {total} messages · page {page} of {pages}
            </span>
            <span className="flex gap-2">
              {page > 1 ? (
                <ButtonLink variant="secondary" href={link(page - 1)}>
                  Previous
                </ButtonLink>
              ) : null}
              {page < pages ? (
                <ButtonLink variant="secondary" href={link(page + 1)}>
                  Next
                </ButtonLink>
              ) : null}
            </span>
          </nav>
        }
      >
        <thead>
          <tr>
            <Th>From</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
            <Th>Assigned to</Th>
            <Th>Received</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                No messages.
              </td>
            </tr>
          ) : (
            rows.map(({ m, assignee }) => (
              <Tr key={m.id}>
                <Td header>
                  <Link
                    href={`/admin/content/messages/${m.id}`}
                    className={`text-link-default underline underline-offset-4 ${m.status === "new" ? "font-bold" : ""}`}
                  >
                    {m.name}
                  </Link>
                  <span className="block text-xs font-normal text-fg-muted">{m.email}</span>
                </Td>
                <Td>{m.subject}</Td>
                <Td>
                  <Badge tone={MESSAGE_TONE[m.status]}>{MESSAGE_LABEL[m.status]}</Badge>
                </Td>
                <Td>{assignee ?? "–"}</Td>
                <Td>{istDateTime(m.createdAt)}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </>
  );
}
