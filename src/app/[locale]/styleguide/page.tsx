import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { styleguideEnabled } from "@/lib/flags";
import { SITE_FONTS, type SiteFont } from "@/lib/fonts";
import { formatRupees } from "@/lib/money";
import { Alert, Badge } from "@/components/ui/Alert";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, Panel, Progress, Stat } from "@/components/ui/Card";
import {
  AmountPicker,
  Choice,
  ChoiceGroup,
  ErrorSummary,
  FormField,
  Input,
  InputPrefix,
  Select,
  Textarea,
} from "@/components/ui/Form";
import { ImagePlaceholder } from "@/components/ui/ImagePlaceholder";
import { Logo } from "@/components/ui/Logo";
import { TextLink } from "@/components/ui/TextLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { RichText } from "@/components/ui/RichText";
import { Eyebrow, HeadingRule, Rule } from "@/components/ui/Typography";
import { DialogDemo } from "./DialogDemo";

// Internal page for reviewing the design system. English labels; sample text in all scripts.
export const metadata: Metadata = { title: "Style guide – MSWT", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const SCALES = ["primary", "neutral", "success", "warning", "error", "info"] as const;
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const SAMPLES = [
  {
    lang: "en",
    text: "Every donation is receipted the moment it is received. ₹1,00,000 · MSWT/2026-27/000123",
  },
  { lang: "hi", text: "हर दान मिलते ही उसकी रसीद जारी होती है। क्ष, त्र, ज्ञ, श्र, द्ध" },
  { lang: "mr", text: "प्रत्येक देणगी मिळताच तिची पावती दिली जाते. ळ, ऱ्य, क्ष, ज्ञ, श्र" },
  { lang: "gu", text: "દરેક દાન મળતાં જ તેની રસીદ આપવામાં આવે છે. ક્ષ, જ્ઞ, શ્ર, દ્ધ" },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-border-decorative py-12">
      <HeadingRule id={id} className="text-3xl">
        {title}
      </HeadingRule>
      {children}
    </section>
  );
}

export default async function StyleguidePage({ params }: { params: Promise<{ locale: string }> }) {
  if (!styleguideEnabled()) notFound();
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <div lang="en" className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <Eyebrow>Design system</Eyebrow>
      <h1 className="text-4xl">Style guide</h1>
      <p className="mt-4 max-w-2xl text-lg text-fg-muted">
        Every token and component, rendered from <code>src/styles/theme.css</code> and{" "}
        <code>src/components/ui</code>. Hidden in production.
      </p>

      <Section id="sg-colour" title="Colour">
        {SCALES.map((scale) => (
          <div key={scale} className="grid gap-2">
            <h3 className="text-lg">{scale}</h3>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 p-0">
              {STEPS.map((step) => (
                <li key={step} className="overflow-hidden rounded-md border border-border-decorative text-xs">
                  <div className="h-14" style={{ background: `var(--color-${scale}-${step})` }} />
                  <p className="p-2">
                    {scale}-{step}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section id="sg-type" title="Typography">
        {(["5xl", "4xl", "3xl", "2xl", "xl", "lg", "base", "sm", "xs"] as const).map((size) => (
          <p key={size} className="leading-snug" style={{ fontSize: `var(--text-${size})` }}>
            <span className="mr-3 text-xs text-fg-muted">text-{size}</span>
            Help families in need
          </p>
        ))}
        <div className="grid gap-4 md:grid-cols-2">
          {SAMPLES.map((s) => (
            <Panel key={s.lang} lang={s.lang}>
              <p className="mb-2 text-2xl font-semibold text-fg-strong">{s.text.split(/[.।]/)[0]}</p>
              <p>{s.text}</p>
            </Panel>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(SITE_FONTS) as SiteFont[]).map((key) => (
            <Panel key={key}>
              <p className="mb-2 text-xs font-semibold tracking-caps text-fg-muted uppercase">
                Site font option: {SITE_FONTS[key].label}
              </p>
              <div data-site-font={key} className="font-sans">
                <p className="text-2xl font-semibold text-fg-strong">Help families in need</p>
                <p lang="hi" className="font-sans">
                  ज़रूरतमंद परिवारों की मदद करें
                </p>
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      <Section id="sg-buttons" title="Buttons and links">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="#sg-buttons" size="lg">
            Large link button
          </ButtonLink>
        </div>
        <div className="on-dark flex flex-wrap items-center gap-4 rounded-lg bg-bg-brand p-6 text-fg-on-brand">
          <Button variant="on-brand">On brand band</Button>
          <a href="#sg-buttons" className="text-fg-on-brand underline">
            Link on brand band
          </a>
        </div>
        <p>
          Inline text with a <TextLink href="#sg-buttons">text link</TextLink>. Press Tab to see focus rings.
        </p>
      </Section>

      <Section id="sg-forms" title="Forms">
        <ErrorSummary
          title="There are 2 problems with your donation details"
          errors={[
            { fieldId: "sg-pan", message: "Enter a PAN in the format ABCPE1234F" },
            { fieldId: "sg-citizen", message: "Confirm that you are an Indian citizen to continue" },
          ]}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <FormField id="sg-name" label="Full name" requiredLabel="required" required>
            {(p) => <Input {...p} autoComplete="name" />}
          </FormField>
          <FormField
            id="sg-email"
            label="Email"
            hint="We send your receipt here."
            requiredLabel="required"
            required
          >
            {(p) => <Input {...p} type="email" autoComplete="email" />}
          </FormField>
          <FormField
            id="sg-pan"
            label="PAN"
            hint="10 characters, for example ABCPE1234F"
            error="Enter a PAN in the format ABCPE1234F"
            requiredLabel="required"
            required
          >
            {(p) => <Input {...p} defaultValue="ABCD1234" autoCapitalize="characters" spellCheck={false} />}
          </FormField>
          <FormField id="sg-amount" label="Other amount" hint="Minimum ₹100. Whole rupees only.">
            {(p) => <InputPrefix {...p} prefix="₹" inputMode="numeric" />}
          </FormField>
          <FormField id="sg-cause" label="Cause">
            {(p) => (
              <Select {...p}>
                <option>General fund – where it&apos;s needed most</option>
                <option>School support for children</option>
              </Select>
            )}
          </FormField>
          <FormField id="sg-disabled" label="Disabled field">
            {(p) => <Input {...p} disabled defaultValue="Not editable" />}
          </FormField>
          <FormField id="sg-message" label="Message" className="md:col-span-2">
            {(p) => <Textarea {...p} />}
          </FormField>
        </div>
        <AmountPicker
          id="sg-preset"
          name="amount"
          legend="Amount"
          defaultValue={500000}
          options={[100000, 250000, 500000, 1000000].map((v) => ({
            value: v,
            label: formatRupees(v, locale),
          }))}
        />
        <ChoiceGroup id="sg-mode" legend="Mode">
          <Choice id="sg-mode-cash" type="radio" name="mode" label="Cash" defaultChecked />
          <Choice id="sg-mode-cheque" type="radio" name="mode" label="Cheque" />
        </ChoiceGroup>
        <Choice
          id="sg-citizen"
          label="I am an Indian citizen and this donation is from my own Indian bank account, card or UPI."
          hint="The Trust is not registered under FCRA, so it can't accept foreign contributions."
          error="Confirm that you are an Indian citizen to continue"
          required
        />
        <Choice id="sg-anon" label="Don't show my name in public donor lists" />
      </Section>

      <Section id="sg-feedback" title="Alerts and badges">
        <Alert tone="success" title="We received your donation of ₹5,000">
          <p>Receipt number MSWT/2026-27/000123.</p>
        </Alert>
        <Alert tone="warning" title="Cash above ₹2,000 isn't eligible for 80G">
          <p>An acknowledgement receipt will be issued instead.</p>
        </Alert>
        <Alert tone="error" title="Your payment didn't go through">
          <p>No money was taken.</p>
        </Alert>
        <Alert tone="info" title="Confirming your payment">
          <p>This usually takes a few seconds.</p>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">Paid</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="error">Failed</Badge>
          <Badge tone="info">80G</Badge>
          <Badge>Draft</Badge>
        </div>
        <DialogDemo />
      </Section>

      <Section id="sg-content" title="Content blocks">
        <Breadcrumbs
          label="Breadcrumb"
          items={[
            { label: "Home", href: "#sg-content" },
            { label: "Causes", href: "#sg-content" },
            { label: "School support" },
          ]}
        />
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <ImagePlaceholder
              description="Photo: children receiving school kits (Trust photo needed)"
              className="rounded-none border-0"
            />
            <CardBody>
              <h3 className="text-xl">School support for children</h3>
              <p className="text-fg-muted">Fees, books and uniforms for children from low-income families.</p>
              <Progress
                value={61}
                label="61% of goal raised"
                meta={
                  <>
                    <span>
                      <strong>{formatRupees(18250000, locale)}</strong> raised
                    </span>
                    <span>goal {formatRupees(30000000, locale)}</span>
                  </>
                }
              />
            </CardBody>
          </Card>
          <Panel tone="brand">
            <h3 className="mb-2 text-xl">Your donation</h3>
            <p>Brand-tinted panel for summaries.</p>
          </Panel>
          <div className="grid gap-6">
            <Stat value="812" label="Donations this year (sample)" />
            <ImagePlaceholder description="Trustee photo" round className="w-32" />
          </div>
        </div>
        <Rule />
      </Section>

      <Section id="sg-rich" title="Rich text, empty state, pagination">
        <RichText
          blocks={[
            { type: "heading", level: 2, text: "Heading from content" },
            { type: "paragraph", text: "Paragraph with **bold text** and a [safe link](/en/causes)." },
            { type: "list", items: ["First item", "Second item"] },
            { type: "callout", tone: "info", text: "Callout block for notes." },
          ]}
        />
        <EmptyState>No events yet.</EmptyState>
        <Pagination
          page={2}
          total={3}
          hrefFor={(n) => `#page-${n}`}
          labels={{ nav: "Pages", previous: "Previous", next: "Next", pageOf: "Page 2 of 3" }}
        />
      </Section>

      <Section id="sg-logo" title="Logo">
        <div className="grid gap-6 md:grid-cols-3">
          <Panel>
            <Logo alt="Horizontal logo on white" width={240} />
          </Panel>
          <div className="on-dark rounded-lg bg-bg-inverse p-6">
            <Logo variant="reversed" alt="Reversed logo on the footer colour" width={240} />
          </div>
          <Panel className="flex items-center gap-6">
            <Logo variant="mark" alt="Mark with rules" width={72} />
            <Logo variant="compact" alt="Compact mark, 32px" width={32} />
            <Logo variant="compact" alt="Compact mark, 16px" width={16} />
          </Panel>
        </div>
      </Section>
    </div>
  );
}
