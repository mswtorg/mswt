import {
  ArrowRight,
  Baby,
  CalendarDays,
  Droplets,
  GraduationCap,
  HandHeart,
  Heart,
  HeartPulse,
  House,
  Images,
  Leaf,
  LifeBuoy,
  MoonStar,
  Newspaper,
  PersonStanding,
  Quote,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { CARD_ICON_KEYS, type CardIconKey } from "@/lib/content/card-icons";

const ICONS: Record<CardIconKey | "event" | "news" | "album" | "story", LucideIcon> = {
  education: GraduationCap,
  health: HeartPulse,
  food: Utensils,
  water: Droplets,
  relief: LifeBuoy,
  environment: Leaf,
  housing: House,
  women: Users,
  children: Baby,
  elderly: PersonStanding,
  ramadan: MoonStar,
  charity: HandHeart,
  heart: Heart,
  event: CalendarDays,
  news: Newspaper,
  album: Images,
  story: Quote,
};

/** The tinted square icon beside a card title (decorative: the title says what it is). */
export function CardIcon({ name }: { name: string | null | undefined }) {
  const Icon =
    name && (CARD_ICON_KEYS as readonly string[]).concat(["event", "news", "album", "story"]).includes(name)
      ? ICONS[name as keyof typeof ICONS]
      : null;
  if (!Icon) return null;
  return (
    <span
      aria-hidden="true"
      className="grid size-12 flex-none place-items-center rounded-lg bg-bg-brand-subtle text-fg-brand"
    >
      <Icon className="size-6" strokeWidth={1.75} />
    </span>
  );
}

/**
 * "Support this cause →": the card's call to action. The whole card is clickable through its title
 * link (`cardLink`), so this is plain text: screen readers hear one link per card, not two.
 */
export function CardCta({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none mt-auto inline-flex items-center gap-2 pt-2 font-semibold text-link-default group-hover:underline"
    >
      {label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
    </span>
  );
}

/** The card's title link: stretched over the whole card, so a click anywhere opens the page. */
export const cardLink =
  "text-fg-strong no-underline after:absolute after:inset-0 after:content-[''] hover:underline";

/** A small label over the top-left corner of a card photo (e.g. the cause's tag, an event date). */
export function CardBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-bg-brand px-3 py-1 text-sm font-semibold text-fg-on-brand shadow-sm">
      {children}
    </span>
  );
}
