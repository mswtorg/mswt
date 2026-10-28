import { Globe } from "lucide-react";
import type { SocialLink } from "@/lib/social";
import { SOCIAL_SPRITE } from "@/lib/social-icons";

/**
 * The Trust's social media profiles as a row of icon links (footer). Each link is named by its
 * platform for screen readers; `rel="me"` marks them as the Trust's own profiles. Brand marks come
 * from one cached sprite (public/icons/social.svg), so each page carries only a short reference.
 */
export function SocialLinks({ label, links }: { label: string; links: SocialLink[] }) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              rel="me noopener"
              aria-label={l.name}
              title={l.name}
              className="grid size-(--size-target-comfortable) place-items-center rounded-full text-fg-inverse-muted hover:text-fg-inverse"
            >
              {l.platform === "website" || l.platform === "linkedin" ? (
                <Globe aria-hidden="true" className="size-5" />
              ) : (
                <svg aria-hidden="true" className="size-5" fill="currentColor">
                  <use href={`${SOCIAL_SPRITE}#${l.platform}`} />
                </svg>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
