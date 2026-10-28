"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./Button";

/**
 * Phone: a "Menu" button that shows/hides the panel. Large screens: the panel is always visible
 * and the button is hidden. The panel's content is rendered on the server.
 */
export function CollapsibleNav({
  id,
  menuLabel,
  children,
}: {
  id: string;
  menuLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(buttonClasses({ variant: "ghost" }), "ml-auto lg:hidden")}
      >
        {menuLabel}
      </button>
      <div
        id={id}
        className={cn(
          "w-full flex-col gap-4 pb-4 max-lg:max-h-[calc(100dvh-5rem)] max-lg:overflow-y-auto lg:ml-auto lg:flex lg:w-auto lg:flex-row lg:items-center lg:gap-6 lg:pb-0",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </>
  );
}
