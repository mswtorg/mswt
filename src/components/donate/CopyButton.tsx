"use client";

import { useState } from "react";

/** Copies one value (account number, IFSC, UPI ID) and says so to screen readers. */
export function CopyButton({
  value,
  label,
  copiedText,
  text,
}: {
  value: string;
  label: string;
  copiedText: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className="min-h-(--size-target-min) rounded-sm px-2 text-sm font-semibold text-link-default underline underline-offset-4"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          } catch {
            // Clipboard blocked: the value is on screen to select by hand.
          }
        }}
      >
        {text}
      </button>
      <span role="status" className="text-sm text-fg-muted">
        {copied ? copiedText : ""}
      </span>
    </>
  );
}
