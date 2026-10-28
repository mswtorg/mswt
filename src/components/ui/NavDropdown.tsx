"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type NavDropdownLink = { href: string; label: string };

/**
 * A header link with a list under it (Causes). Large screens: the link stays a link, and a chevron
 * button (or hovering) opens a panel; Esc, clicking outside or tabbing away closes it. Phones (in
 * the Menu panel): the list shows indented under the link. Every link is in the server HTML, so
 * crawlers and visitors without JavaScript still reach each page.
 */
export function NavDropdown({
  id,
  link,
  current = false,
  toggleLabel,
  items,
  all,
  linkClassName,
}: {
  id: string;
  link: NavDropdownLink;
  current?: boolean;
  /** Accessible name of the chevron button, e.g. "Causes list". */
  toggleLabel: string;
  items: NavDropdownLink[];
  /** The last link in the panel ("View all causes"). */
  all: NavDropdownLink;
  linkClassName: string;
}) {
  // "hover" closes again when the mouse leaves; "click" (button or keyboard) stays until closed.
  const [open, setOpen] = useState<false | "hover" | "click">(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Mouse hover opens it; focus leaving the whole dropdown closes it.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const enter = (e: PointerEvent) => e.pointerType === "mouse" && setOpen((o) => o || "hover");
    const leave = (e: PointerEvent) =>
      e.pointerType === "mouse" && setOpen((o) => (o === "hover" ? false : o));
    const focusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setOpen(false);
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusout", focusOut);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusout", focusOut);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <div className="flex items-center">
        <a href={link.href} aria-current={current ? "page" : undefined} className={linkClassName}>
          {link.label}
        </a>
        <button
          ref={toggle}
          type="button"
          aria-expanded={Boolean(open)}
          aria-controls={id}
          aria-label={toggleLabel}
          onClick={() => setOpen((o) => (o === "click" ? false : "click"))}
          className="hidden size-(--size-target-comfortable) place-items-center rounded-sm text-fg-default hover:text-link-hover lg:grid"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {/* Phones: always listed under the link. Large screens: a panel shown while open. */}
      <div
        id={id}
        className={cn(
          "lg:absolute lg:top-full lg:left-0 lg:z-10 lg:w-72 lg:pt-2",
          open ? "lg:block" : "lg:hidden",
        )}
      >
        <ul className="m-0 list-none border-l-2 border-border-decorative py-0 pl-4 lg:rounded-md lg:border lg:bg-bg-canvas lg:p-2 lg:shadow-md">
          {[...items, all].map((item, i) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={cn(
                  "flex min-h-(--size-target-comfortable) items-center rounded-sm text-fg-default no-underline hover:text-link-hover hover:underline lg:px-3 lg:hover:bg-bg-subtle",
                  i === items.length && "font-medium text-link-default",
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
