"use client";

import { useEffect, useState } from "react";
import { TextLink } from "@/components/ui/TextLink";

type Page = { href: string; label: string };

/** The site's main pages that the service worker has saved, so they open without a connection. */
export function SavedPages({ heading, pages }: { heading: string; pages: Page[] }) {
  const [saved, setSaved] = useState<Page[]>([]);
  useEffect(() => {
    if (!("caches" in window)) return;
    let active = true;
    Promise.all(pages.map(async (p) => ((await caches.match(p.href)) ? p : null)))
      .then((found) => active && setSaved(found.filter((p): p is Page => p !== null)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pages]);
  if (!saved.length) return null;
  return (
    <nav aria-labelledby="saved-pages" className="mx-auto mt-12 max-w-xl">
      <h2 id="saved-pages" className="text-xl">
        {heading}
      </h2>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
        {saved.map((p) => (
          <li key={p.href}>
            <TextLink href={p.href}>{p.label}</TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
