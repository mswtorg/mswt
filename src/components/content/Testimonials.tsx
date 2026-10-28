import type { Locale } from "@/i18n/routing";
import { getMediaViews } from "@/lib/content/media";
import type { Testimonial } from "@/lib/content/testimonials";
import { formatDate, istDay } from "@/lib/dates/format";
import { Card, CardBody } from "@/components/ui/Card";
import { getTranslations } from "next-intl/server";
import { CardBadge, CardCta, CardIcon, cardLink } from "./CardIcon";
import { ResponsiveImage } from "./ResponsiveImage";

/** The story's date: "14 March 2026" in the page's language. */
export function StoryDate({ day, locale }: { day: string; locale: Locale }) {
  return <time dateTime={day}>{formatDate(locale, istDay(day))}</time>;
}

/**
 * Testimonial cards: date, heading (links to the story), summary, and who it's from.
 * The photo is decorative: the person's name is right beside it.
 */
export async function TestimonialList({
  items,
  locale,
  headingLevel = 3,
}: {
  items: Testimonial[];
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const t = await getTranslations("Testimonials");
  const ids = items.flatMap((s) => (s.photoId ? [s.photoId] : []));
  const views = ids.length > 0 ? await getMediaViews(ids, locale) : {};
  return (
    <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => {
        const image = s.photoId ? views[s.photoId] : undefined;
        return (
          <li key={s.id} className="grid">
            <Card>
              <CardBody className="gap-4">
                <p>
                  <CardBadge>
                    <StoryDate day={s.storyDate} locale={locale} />
                  </CardBadge>
                </p>
                <div className="flex items-center gap-4">
                  <CardIcon name="story" />
                  <H className="min-w-0 text-xl">
                    <a href={`/${locale}/testimonials/${s.slug}`} className={cardLink}>
                      {s.title}
                    </a>
                  </H>
                </div>
                {s.summary ? <p className="text-fg-muted">{s.summary}</p> : null}
                <p className="flex items-center gap-3">
                  {image?.src ? (
                    <ResponsiveImage
                      image={image}
                      alt=""
                      sizes="48px"
                      className="aspect-square w-12 shrink-0 rounded-full"
                    />
                  ) : null}
                  <span>
                    <span className="block font-semibold text-fg-strong">{s.name}</span>
                    {s.role ? <span className="block text-sm text-fg-muted">{s.role}</span> : null}
                  </span>
                </p>
                <CardCta label={t("readStory")} />
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
