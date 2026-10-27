import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { messages, users } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";

export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_STATUSES = ["new", "read", "replied", "spam"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export const MESSAGE_LABEL: Record<MessageStatus, string> = {
  new: "New",
  read: "Read",
  replied: "Replied",
  spam: "Spam",
};
export const MESSAGE_TONE = { new: "info", read: "neutral", replied: "success", spam: "error" } as const;

export async function newMessageCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(messages).where(eq(messages.status, "new"));
  return row?.n ?? 0;
}

export type MessageFilters = { status?: MessageStatus; assignee?: string; q?: string; page?: number };

export function parseMessageFilters(q: Record<string, string | undefined>): MessageFilters {
  const status = MESSAGE_STATUSES.find((s) => s === q.status);
  const assignee = q.assignee === "none" || /^[0-9a-f-]{36}$/.test(q.assignee ?? "") ? q.assignee : undefined;
  return {
    status,
    assignee,
    q: q.q?.trim().slice(0, 100) || undefined,
    page: Math.max(1, Number(q.page) || 1),
  };
}

export async function listMessages(f: MessageFilters) {
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const conditions: (SQL | undefined)[] = [
    f.status ? eq(messages.status, f.status) : undefined,
    f.assignee === "none"
      ? isNull(messages.assignedTo)
      : f.assignee
        ? eq(messages.assignedTo, f.assignee)
        : undefined,
    like
      ? or(ilike(messages.name, like), ilike(messages.email, like), ilike(messages.subject, like))
      : undefined,
  ];
  const where = and(...conditions);
  const [rows, [total]] = await Promise.all([
    db
      .select({ m: messages, assignee: users.name })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.assignedTo))
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(MESSAGE_PAGE_SIZE)
      .offset(((f.page ?? 1) - 1) * MESSAGE_PAGE_SIZE),
    db.select({ n: count() }).from(messages).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

/** People a message can be assigned to: active Super Admins and Content Editors. */
export async function assignees() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(inArray(users.role, ["super_admin", "content_editor"]), eq(users.isActive, true)))
    .orderBy(users.name);
}

export async function getMessage(id: string) {
  const [row] = await db
    .select({ m: messages, assignee: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.assignedTo))
    .where(eq(messages.id, id));
  return row ?? null;
}

/** Opening a new message marks it read (audited like any other change). */
export async function markRead(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const updated = await tx
      .update(messages)
      .set({ status: "read", updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.status, "new")))
      .returning({ id: messages.id });
    if (updated.length)
      await recordAudit(tx, actor, {
        action: "message.update",
        entityType: "message",
        entityId: id,
        before: { status: "new" },
        after: { status: "read" },
      });
  });
}

export const MessageUpdateInput = z.object({
  status: z.enum(MESSAGE_STATUSES),
  assignedTo: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});

export async function updateMessage(id: string, input: z.infer<typeof MessageUpdateInput>, actor: Actor) {
  await withTx(async (tx) => {
    const [before] = await tx
      .select({ status: messages.status, assignedTo: messages.assignedTo })
      .from(messages)
      .where(eq(messages.id, id));
    if (!before) throw new Error("Message not found");
    if (input.assignedTo) {
      const [ok] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.assignedTo),
            inArray(users.role, ["super_admin", "content_editor"]),
            eq(users.isActive, true),
          ),
        );
      if (!ok) throw new Error("That person can't be assigned messages");
    }
    await tx
      .update(messages)
      .set({ status: input.status, assignedTo: input.assignedTo, updatedAt: new Date() })
      .where(eq(messages.id, id));
    await recordAudit(tx, actor, {
      action: "message.update",
      entityType: "message",
      entityId: id,
      before,
      after: input,
    });
  });
}

/**
 * Deletes one message for good (owner decision B16: messages are kept until an admin deletes
 * them). The audit entry keeps who deleted what and when, not the message text.
 */
export async function deleteMessage(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(messages)
      .where(eq(messages.id, id))
      .returning({ subject: messages.subject, createdAt: messages.createdAt });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "message.delete",
        entityType: "message",
        entityId: id,
        before: { subject: gone[0]!.subject, receivedAt: gone[0]!.createdAt.toISOString() },
      });
  });
}
