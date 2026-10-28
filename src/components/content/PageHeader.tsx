import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { HeadingRule } from "@/components/ui/Typography";

/** Breadcrumbs + H1 (with the logo rule) + optional lead paragraph, shared by every inner page. */
export function PageHeader({
  crumbs,
  crumbLabel,
  title,
  lead,
  children,
}: {
  crumbs: Crumb[];
  crumbLabel: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-10">
      <Breadcrumbs label={crumbLabel} items={crumbs} />
      <HeadingRule as="h1" className="text-4xl">
        {title}
      </HeadingRule>
      {lead ? <p className="mt-4 text-xl text-fg-muted">{lead}</p> : null}
      {children}
    </header>
  );
}
