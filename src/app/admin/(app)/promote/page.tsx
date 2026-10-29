import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { kindOf, AREA_LABEL, type Area } from "@/lib/promote/kinds";
import type { Compared, Status } from "@/lib/promote/diff";
import { compareSites } from "@/lib/promote/source";
import { AdminForm } from "@/components/admin/AdminForm";
import { SelectAllMoves } from "@/components/admin/SelectAllMoves";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { moveFromStage } from "./actions";

export const metadata: Metadata = { title: "Move from stage" };
// Copying photos from stage can take a while.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const STATUS: Record<Status, { label: string; className: string }> = {
  new: { label: "New on stage", className: "bg-status-success-bg text-status-success-fg" },
  changed: { label: "Changed", className: "bg-status-info-bg text-status-info-fg" },
  same: { label: "Same", className: "bg-bg-muted text-fg-default" },
  prod_only: { label: "Only on production", className: "bg-status-warning-bg text-status-warning-fg" },
  clash: { label: "Clash: same address", className: "bg-status-error-bg text-status-error-fg" },
};
const AREAS: Area[] = ["content", "site", "receipts", "payment"];
const time = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

function Chip({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
  );
}

function Row({ r }: { r: Compared }) {
  const id = `promote-${r.ref.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  const movable = r.status === "new" || r.status === "changed";
  const removable = r.status === "prod_only" && kindOf(r.type).removable && !r.note;
  return (
    <li className="grid gap-2 border-b border-border-decorative py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {movable || removable ? (
          <input
            id={id}
            type="checkbox"
            name={movable ? "move" : "remove"}
            value={`${r.ref}|${r.hash}`}
            className="size-5 accent-action-primary-bg"
          />
        ) : null}
        <label htmlFor={movable || removable ? id : undefined} className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-fg-strong">{r.title}</span>{" "}
          <span className="text-fg-muted">· {kindOf(r.type).label}</span>
          {removable ? <span className="text-fg-muted"> · tick to remove it from production</span> : null}
        </label>
        <Chip status={r.status} />
      </div>
      {r.note ? <p className="m-0 text-sm text-status-error-fg-on-canvas">{r.note}</p> : null}
      {r.status === "new" ? (
        <p className="m-0 text-sm text-fg-muted">Not on production yet: moving it adds it.</p>
      ) : null}
      {r.changes.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-link-default">
            View changes ({r.changes.length})
          </summary>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {r.changes.map((c, i) => (
              <li key={i} className="grid gap-0.5 rounded-md bg-bg-subtle px-3 py-2">
                <span className="font-medium text-fg-strong">{c.label}</span>
                {c.before !== undefined ? (
                  <span className="break-words text-fg-muted">
                    Production: <span className="text-fg-default">{c.before}</span>
                    <br />
                    Stage: <span className="text-fg-default">{c.after}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export default async function PromotePage() {
  await requireCapability("promote.manage");
  const cmp = await compareSites();
  const header = (
    <PageHeader
      title="Move from stage"
      description="Compare what was edited on the stage site with this site, then move the items you tick. Photos and PDFs come along. Donations, donors, receipts, users and the amount raised are never moved."
    />
  );
  if (!cmp.ok)
    return (
      <>
        {header}
        <Alert tone="warning">
          <p>{cmp.message}</p>
          {cmp.setup ? (
            <p>
              Setup: give this site a read-only login to the stage database (STAGE_DATABASE_URL) and the
              public address of stage’s photo storage (STAGE_MEDIA_PUBLIC_URL). The steps are in
              docs/manual-checks.md (MP-1, MP-2).
            </p>
          ) : null}
        </Alert>
      </>
    );

  const count = (s: Status) => cmp.rows.filter((r) => r.status === s).length;
  const pending = cmp.rows.filter((r) => r.status !== "same");
  return (
    <>
      {header}
      <p className="m-0 text-sm text-fg-muted" role="status">
        Compared stage with this site at {time(cmp.at)}: {count("new")} new, {count("changed")} changed,{" "}
        {count("prod_only")} only on this site{count("clash") ? `, ${count("clash")} clash` : ""}. Reload the
        page to compare again.
      </p>
      {/* The form stays after a move (the page compares again), so its result message stays too. */}
      <AdminForm
        id="promote"
        action={moveFromStage}
        submitLabel="Move selected to production"
        pendingLabel="Moving… (copying photos)"
        confirm="Move the ticked items to production? This changes the live site."
      >
        {pending.length === 0 ? (
          <Alert tone="success">
            <p>Everything is the same on stage and this site. Nothing to move.</p>
          </Alert>
        ) : (
          <SelectAllMoves />
        )}
        <Card>
          {AREAS.map((area) => {
            const rows = cmp.rows.filter((r) => r.area === area);
            const open = rows.filter((r) => r.status !== "same");
            const same = rows.filter((r) => r.status === "same");
            if (!rows.length) return null;
            return (
              <Section
                key={area}
                id={`area-${area}`}
                title={AREA_LABEL[area]}
                description={`${open.length} to review`}
              >
                {open.length ? (
                  <ul className="m-0 list-none p-0">
                    {open.map((r) => (
                      <Row key={r.ref} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-sm text-fg-muted">Nothing changed here.</p>
                )}
                {same.length ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-fg-muted">Show unchanged ({same.length})</summary>
                    <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-fg-muted">
                      {same.map((r) => (
                        <li key={r.ref}>
                          {r.title} · {kindOf(r.type).label}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Section>
            );
          })}
        </Card>
      </AdminForm>
    </>
  );
}
