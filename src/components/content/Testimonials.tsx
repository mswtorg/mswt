import type { Locale } from "@/i18n/routing";
import { getMediaViews } from "@/lib/content/media";
import type { Testimonial } from "@/lib/content/testimonials";
import { Card, CardBody } from "@/components/ui/Card";
import { ResponsiveImage } from "./ResponsiveImage";

/** Testimonial quotes as cards. The photo is decorative: the person's name is in the caption. */
export async function TestimonialList({ items, locale }: { items: Testimonial[]; locale: Locale }) {
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
                <figure className="m-0 flex h-full flex-col gap-6">
                  <blockquote className="m-0 border-l-2 border-border-rule pl-4 text-lg">
                    <p className="whitespace-pre-line">{t.quote}</p>
                  </blockquote>
                  <figcaption className="mt-auto flex items-center gap-3">
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
                  </figcaption>
                </figure>
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
