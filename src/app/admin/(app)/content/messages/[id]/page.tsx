import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { actorFor } from "@/lib/admin/actor";
import { istDateTime } from "@/lib/admin/format";
import { LANGUAGES } from "@/lib/admin/languages";
import {
  assignees,
  getMessage,
  markRead,
  MESSAGE_LABEL,
  MESSAGE_STATUSES,
  MESSAGE_TONE,
} from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, Details, PageHeader, Section } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { deleteMessageAction, updateMessageAction } from "../actions";

export const metadata: Metadata = { title: "Message" };
type Props = { params: Promise<{ id: string }> };

/** A mailto: link with the subject and the message quoted, opened in the admin's own mail app. */
function replyHref(m: { email: string; subject: string; body: string; createdAt: Date }) {
  const quoted = m.body
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const params = new URLSearchParams({
    subject: `Re: ${m.subject}`,
    body: `\n\nOn ${istDateTime(m.createdAt)} you wrote:\n${quoted}`,
  });
  return `mailto:${encodeURIComponent(m.email)}?${params.toString().replace(/\+/g, "%20")}`;
}

export default async function MessagePage({ params }: Props) {
  const { admin, actor } = await actorFor("messages.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const write = can(admin.role, "messages.write");
  // Opening a new message marks it read (only for people who handle messages).
  if (write) await markRead(id, actor);
  const [row, people] = await Promise.all([getMessage(id), assignees()]);
  if (!row) notFound();
  const { m, assignee } = row;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/messages", label: "Messages" }}
        title={m.subject}
        description={`From ${m.name} · ${istDateTime(m.createdAt)}`}
        actions={
          <>
            <Badge tone={MESSAGE_TONE[m.status]}>{MESSAGE_LABEL[m.status]}</Badge>
            {write ? <ButtonLink href={replyHref(m)}>Reply by email</ButtonLink> : null}
          </>
        }
      />
      <Card>
        <Section id="sender" title="Sender">
          <Details
            items={[
              { label: "Name", value: m.name },
              { label: "Email", value: m.email },
              { label: "Phone", value: m.phone },
              { label: "Language", value: LANGUAGES[m.locale].name },
              { label: "Assigned to", value: assignee },
            ]}
          />
        </Section>
        <Section id="message" title="Message">
          <p lang={m.locale} className="m-0 text-sm break-words whitespace-pre-line text-fg-default">
            {m.body}
          </p>
        </Section>
      </Card>
      {write ? (
        <AdminForm
          id="message"
          action={updateMessageAction.bind(null, id)}
          submitLabel="Save"
          sections={[
            {
              title: "Handling",
              description: "Mark it replied after answering from your mail app.",
              fields: [
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  defaultValue: m.status,
                  options: MESSAGE_STATUSES.map((s) => ({ value: s, label: MESSAGE_LABEL[s] })),
                },
                {
                  name: "assignedTo",
                  label: "Assigned to",
                  type: "select",
                  defaultValue: m.assignedTo ?? "",
                  options: [
                    { value: "", label: "Nobody" },
                    ...people.map((p) => ({ value: p.id, label: p.name })),
                  ],
                },
              ],
            },
          ]}
        />
      ) : null}
      {write ? (
        <Card>
          <Section
            id="delete"
            title="Delete"
            description="Removes the message for good. The audit log keeps who deleted it and when, not the text."
          >
            <AdminForm
              id="delete-message"
              action={deleteMessageAction.bind(null, id)}
              submitLabel="Delete message"
              variant="danger"
              confirm="Delete this message? This can't be undone."
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
    </>
  );
}
