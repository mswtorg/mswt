import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { AlbumView, CauseView, EventView, NewsView } from "@/lib/content/queries";
import { formatDate, formatShortDate, isoIst } from "@/lib/dates/format";
import { formatRupees } from "@/lib/money";
import { Badge } from "@/components/ui/Alert";
import { Card, CardBody, Progress } from "@/components/ui/Card";
import { ImagePlaceholder } from "@/components/ui/ImagePlaceholder";
import { CardBadge, CardCta, CardIcon, cardLink as titleLink } from "./CardIcon";
import { CoverImage } from "./CoverImage";

const COVER_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw";

/** The card photo with an optional badge over its top-left corner; without a photo, just the badge. */
function CardTop({ cover, badge }: { cover: React.ReactNode; badge?: React.ReactNode }) {
  if (!cover) return badge ? <div className="px-6 pt-6">{badge}</div> : null;
  return (
    <div className="relative">
      {cover}
      {badge ? <div className="pointer-events-none absolute top-4 left-4 z-10">{badge}</div> : null}
    </div>
  );
}

/** Icon (when there is one) and the title, side by side. */
function CardTitle({ icon, children }: { icon?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <CardIcon name={icon} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export async function CauseCard({
  cause,
  locale,
  headingLevel = 3,
}: {
  cause: CauseView;
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations("Causes");
  const H = `h${headingLevel}` as "h2" | "h3";
  const pct = cause.goalPaise ? Math.round((cause.raisedPaise / cause.goalPaise) * 100) : null;
  return (
    <Card>
      <CardTop
        cover={
          <CoverImage
            mediaId={cause.coverImageId}
            locale={locale}
            fallback={cause.title}
            sizes={COVER_SIZES}
            className="rounded-none border-0"
          />
        }
        badge={cause.tag ? <CardBadge>{cause.tag}</CardBadge> : null}
      />
      <CardBody className="gap-4">
        <CardTitle icon={cause.icon}>
          <H className="text-xl">
            <a href={`/${locale}/causes/${cause.slug}`} className={titleLink}>
              {cause.title}
            </a>
          </H>
        </CardTitle>
        {cause.status === "closed" ? <Badge>{t("closed")}</Badge> : null}
        <p className="text-fg-muted">{cause.summary}</p>
        {pct !== null ? (
          <div>
            <Progress
              value={pct}
              label={t("progressLabel", { percent: Math.min(pct, 100) })}
              meta={
                <>
                  <span>{t("raised", { amount: formatRupees(cause.raisedPaise, locale) })}</span>
                  <span>{t("goal", { amount: formatRupees(cause.goalPaise!, locale) })}</span>
                </>
              }
            />
          </div>
        ) : null}
        <CardCta label={cause.status === "closed" ? t("readMore") : t("support")} />
      </CardBody>
    </Card>
  );
}

export async function NewsCard({
  post,
  locale,
  publishedLabel,
}: {
  post: NewsView;
  locale: Locale;
  publishedLabel: string;
}) {
  const t = await getTranslations("News");
  return (
    <Card>
      <CardTop
        cover={
          post.coverImageId ? (
            <CoverImage
              mediaId={post.coverImageId}
              locale={locale}
              fallback={post.headline}
              sizes={COVER_SIZES}
              className="rounded-none border-0"
            />
          ) : null
        }
        badge={<CardBadge>{t("badge")}</CardBadge>}
      />
      <CardBody className="gap-4">
        <p className="text-sm text-fg-muted">
          <time dateTime={isoIst(post.publishedAt)}>{publishedLabel}</time>
        </p>
        <CardTitle icon="news">
          <h3 className="text-xl">
            <a href={`/${locale}/news/${post.slug}`} className={titleLink}>
              {post.headline}
            </a>
          </h3>
        </CardTitle>
        <p className="text-fg-muted">{post.excerpt}</p>
        <CardCta label={t("readMore")} />
      </CardBody>
    </Card>
  );
}

const statusTone = {
  scheduled: "info",
  cancelled: "error",
  postponed: "warning",
  rescheduled: "warning",
  moved_online: "info",
} as const;

export async function EventCard({
  event,
  locale,
  headingLevel = 3,
}: {
  event: EventView;
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations("Events");
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <Card>
      <CardTop
        cover={
          event.coverImageId ? (
            <CoverImage
              mediaId={event.coverImageId}
              locale={locale}
              fallback={event.title}
              sizes={COVER_SIZES}
              className="rounded-none border-0"
            />
          ) : null
        }
        badge={<CardBadge>{formatShortDate(locale, event.startsAt)}</CardBadge>}
      />
      <CardBody className="gap-4">
        <p className="text-sm text-fg-muted">
          <time dateTime={isoIst(event.startsAt)}>{formatDate(locale, event.startsAt, true)}</time>
        </p>
        <CardTitle icon="event">
          <H className="text-xl">
            <a href={`/${locale}/events/${event.slug}`} className={titleLink}>
              {event.title}
            </a>
          </H>
        </CardTitle>
        {event.eventStatus !== "scheduled" ? (
          <p>
            <Badge tone={statusTone[event.eventStatus]}>{t(`status.${event.eventStatus}`)}</Badge>
          </p>
        ) : null}
        <p className="text-fg-muted">{event.summary}</p>
        <CardCta label={t("view")} />
      </CardBody>
    </Card>
  );
}

export async function AlbumCard({
  album,
  locale,
  headingLevel = 2,
}: {
  album: AlbumView;
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations("Gallery");
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <Card>
      {album.coverImageId || album.items[0]?.mediaId ? (
        <CoverImage
          mediaId={album.coverImageId ?? album.items[0]!.mediaId!}
          locale={locale}
          fallback={album.items[0]?.alt ?? album.title}
          sizes={COVER_SIZES}
          className="rounded-none border-0"
        />
      ) : (
        <ImagePlaceholder
          description={album.items[0]?.alt ?? album.title}
          className="rounded-none border-0"
        />
      )}
      <CardBody className="gap-4">
        <CardTitle icon="album">
          <H className="text-xl">
            <a href={`/${locale}/gallery/${album.slug}`} className={titleLink}>
              {album.title}
            </a>
          </H>
        </CardTitle>
        <p className="text-sm text-fg-muted">{t("photos", { count: album.items.length })}</p>
        <CardCta label={t("view")} />
      </CardBody>
    </Card>
  );
}
