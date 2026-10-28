import type { Locale } from "@/i18n/routing";
import { getMediaViews } from "@/lib/content/media";
import type { Testimonial } from "@/lib/content/testimonials";
import { formatDate, istDay } from "@/lib/dates/format";
import { Card, CardBody } from "@/components/ui/Card";
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
  const ids = items.flatMap((t) => (t.photoId ? [t.photoId] : []));
  const views = ids.length > 0 ? await getMediaViews(ids, locale) : {};
  return (
    <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => {
        const image = t.photoId ? views[t.photoId] : undefined;
        return (
          <li key={t.id} className="grid">
            <Card>
              <CardBody>
                <p className="text-sm text-fg-muted">
                  <StoryDate day={t.storyDate} locale={locale} />
                </p>
                <H className="text-xl">
                  <a
                    href={`/${locale}/testimonials/${t.slug}`}
                    className="text-fg-strong no-underline hover:underline"
                  >
                    {t.title}
                  </a>
                </H>
                {t.summary ? <p className="text-fg-muted">{t.summary}</p> : null}
                <p className="mt-auto flex items-center gap-3 pt-2">
                  {image?.src ? (
                    <ResponsiveImage
                      image={image}
                      alt=""
                      sizes="48px"
                      className="aspect-square w-12 shrink-0 rounded-full"
                    />
                  ) : null}
                  <span>
                    <span className="block font-semibold text-fg-strong">{t.name}</span>
                    {t.role ? <span className="block text-sm text-fg-muted">{t.role}</span> : null}
                  </span>
                </p>
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
