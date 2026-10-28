import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        // Rounded tile with a lift on hover; a title link with `cardLink` stretches over it.
        "group relative flex flex-col overflow-hidden rounded-xl border border-border-decorative bg-bg-canvas transition-shadow duration-(--duration-base) ease-standard hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-1 flex-col gap-3 p-6", className)} {...props} />;
}

export function Panel({
  tone = "plain",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "plain" | "brand"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg p-6",
        tone === "brand" ? "bg-bg-brand-subtle" : "border border-border-decorative bg-bg-canvas",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Figure with the logo-style rule above it. */
export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="border-t-2 border-border-rule pt-3">
      <p className="text-3xl leading-tight font-semibold text-fg-strong">{value}</p>
      <p className="text-fg-muted">{label}</p>
    </div>
  );
}

export function Progress({ value, label, meta }: { value: number; label: string; meta?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="grid gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-bg-muted"
      >
        <div className="h-full bg-action-primary-bg" style={{ width: `${pct}%` }} />
      </div>
      {meta ? <div className="flex justify-between text-sm text-fg-muted">{meta}</div> : null}
    </div>
  );
}
