# Brand & design tokens

The machine-readable source of truth is [`tokens/design-tokens.json`](../tokens/design-tokens.json). It uses the W3C Design Tokens format with the draft string syntax (`"#rrggbb"`, `"1rem"`), which Tokens Studio (Figma) and Style Dictionary can read today. If the Tailwind build in Step 3 needs it, we can switch to the 2025.10 object syntax. Components use **only** the `semantic.*` aliases, never the core scales directly.

Source artwork lives in [`brand/logo/`](../brand/logo/). Those SVGs were **traced from screenshots** on 2026-10-20. If the designer's original vector file turns up, it replaces them ([open-questions](open-questions.md) A1).

## 1. Logo analysis

| Element | What it is | What it means for the site |
|---|---|---|
| Monogram | A high-contrast Didone-style serif **M** in green, interlocked with a black **S** that has ball terminals. The M sits in front of the S. | Formal, classical and trustworthy. Contrast comes from thick vs thin strokes, not from many colours |
| Rules | A green horizontal rule above the mark and a black one below, both the width of the mark | **Horizontal rules are the signature motif**: a 2px rule under section headings and above the footer, in place of heavy boxes |
| Wordmark | Geometric sans, all caps, widely tracked. "MUNIRA SHOAIB" is larger and medium weight; "WELFARE TRUST" is smaller and regular. Colour is slate `#32373d` | UI and body text in a geometric sans (Poppins, owner decision). Tracked uppercase for eyebrows and labels (`font.letter-spacing.caps`) |
| Colour | Two hues only: green `#4b9d66` and black/slate. No warm accent | Green carries the brand and the actions. Slate carries text. **No accent colour has been invented.** One can be added only if the Trust approves it (open-questions A8) |
| Geometry | Sharp serifs, straight edges, no rounded shapes, lots of white space | Small radii (2–8px), flat surfaces, generous spacing, photos with plain rectangular or 8px corners |

Logo colours sampled from the screenshots: **green `#4b9d66`** (chosen by the owner; the close-up screenshot read `#41934d` because of a colour-profile shift), **black `#000000`**, **slate `#32373d`**.

## 2. Colour

### 2.1 Method
- Each scale is built in **OKLCH**: the hue stays fixed, lightness runs from 0.975 down to 0.255, and chroma tapers toward both ends, clipped to the sRGB gamut.
- The logo colour is **pinned** (◆) to the step whose lightness matches it: green L 0.630 → `primary.500`, slate L 0.334 → `neutral.900`.
- `secondary` = the slate/ink family, so it is the `neutral` scale. The logo has no third hue, so there is no separate secondary or accent scale.
- Status hues: success 138 (deliberately yellower than the brand green at 152, so a success state doesn't read as a brand element), warning 70, error 27, info 245. Status is always shown with an icon **and** text, never colour alone.

### 2.2 Exact logo colours (`color.brand.*`)
| Token | Hex | Use |
|---|---|---|
| `brand.green` | `#4b9d66` | The logo, decorative rules, display text ≥24px on white. **Not** for body text (3.33:1) and **not** behind white text (3.33:1) |
| `brand.ink` | `#000000` | Logo artwork only |
| `brand.slate` | `#32373d` | Same as `neutral.900`: default text colour |

### 2.3 Scales
◆ = pinned logo colour.

| Step | primary | neutral | success | warning | error | info |
|---|---|---|---|---|---|---|
| 50 | `#f0faf2` | `#f6f7f8` | `#f1faee` | `#fff5ea` | `#fff4f2` | `#f0f8ff` |
| 100 | `#dff3e4` | `#ebedef` | `#e1f3db` | `#ffe9d1` | `#ffe7e3` | `#deefff` |
| 200 | `#c2e5ca` | `#d8dbde` | `#c5e6bb` | `#fad3a7` | `#fecdc7` | `#bde0fe` |
| 300 | `#9bd2a9` | `#bfc3c8` | `#a1d390` | `#f1b66f` | `#fea99f` | `#8bcaff` |
| 400 | `#6eb683` | `#9ea4aa` | `#77b761` | `#db9125` | `#ff6f64` | `#50aaf1` |
| 500 | **`#4b9d66`** ◆ | `#82888f` | `#569c3b` | `#ba7709` | `#ec3f3a` | `#198edb` |
| 600 | `#2f834e` | `#6b7177` | `#3e831f` | `#9b6200` | `#ce1a1f` | `#0175ba` |
| 700 | `#1b6d3c` | `#585d63` | `#2c6d08` | `#805001` | `#af0011` | `#02619a` |
| 800 | `#0b562c` | `#44484d` | `#1f5600` | `#653e01` | `#8b000b` | `#014b79` |
| 900 | `#064120` | **`#32373d`** ◆ | `#164100` | `#4c2e01` | `#6a0006` | `#01385c` |
| 950 | `#022b13` | `#202326` | `#0c2b01` | `#331d01` | `#480103` | `#01253f` |

### 2.4 Semantic aliases (what components use)
| Token | Value | Use |
|---|---|---|
| `bg.canvas` / `subtle` / `muted` | white / neutral.50 / neutral.100 | Page background, alternate sections, cards |
| `bg.brand-subtle` | primary.50 | Light green tint (donate panel, highlights) |
| `bg.brand` / `brand-strong` | primary.800 / primary.900 | Hero and CTA bands with white text |
| `bg.inverse` | neutral.950 | Footer |
| `fg.default` / `strong` / `muted` / `hint` | neutral.900 / 950 / 700 / 600 | Text. neutral.600 is the lightest grey allowed for text |
| `fg.disabled` | neutral.400 | Disabled controls only |
| `fg.brand` | primary.700 | Green text and eyebrows |
| `fg.brand-display` | brand.green | Display text ≥24px (or ≥18.66px bold) on canvas only |
| `fg.inverse` / `inverse-muted` | white / neutral.200 | Footer text |
| `fg.on-brand` / `on-brand-muted` | white / primary.100 | Text on brand bands |
| `border.decorative` / `input` / `brand` / `rule` | neutral.200 / neutral.500 / primary.700 / brand.green | Dividers, form controls, outline buttons, the logo-style rule |
| `action.primary.*` | bg primary.700 → hover 800 → active 900, fg white | Donate and primary buttons |
| `action.secondary.*` | bg white (hover primary.50), fg primary.800, border primary.700 | Outline buttons |
| `link.default` / `hover` / `inverse` | primary.700 / primary.800 / primary.300 | Links are **always underlined** (only 1.89:1 against body text) |
| `focus.ring` / `ring-inverse` | primary.700 / white | 3px ring with a 2px offset |
| `status.{success,warning,error,info}.*` | bg 50 · fg 800 · fg-on-canvas 700 · icon 600 · solid-bg 700 · solid-fg white | Alerts, badges, field errors |
| `pwa.theme` / `background` | primary.800 / white | Manifest `theme_color` / `background_color` |

### 2.5 Contrast table
WCAG 2.x relative luminance, computed from the exact hex values. Text needs 4.5:1. Large text, UI components and focus indicators need 3:1. **REJECTED** rows fail and are listed so nobody uses them. "exempt" rows are logos, decorative elements and disabled controls; they have no requirement and are shown for reference.

| Group | Use | Foreground | Background | Ratio | Needs | Result |
|---|---|---|---|--:|--:|---|
| Text | Body text | `neutral.900` #32373d | `white` #ffffff | 12.00:1 | 4.5:1 | ✅ PASS |
| Text | Body text on subtle bg | `neutral.900` #32373d | `neutral.50` #f6f7f8 | 11.19:1 | 4.5:1 | ✅ PASS |
| Text | Body text on brand tint | `neutral.900` #32373d | `primary.50` #f0faf2 | 11.24:1 | 4.5:1 | ✅ PASS |
| Text | Headings | `neutral.950` #202326 | `white` #ffffff | 15.79:1 | 4.5:1 | ✅ PASS |
| Text | Muted text | `neutral.700` #585d63 | `white` #ffffff | 6.64:1 | 4.5:1 | ✅ PASS |
| Text | Muted text on subtle bg | `neutral.700` #585d63 | `neutral.50` #f6f7f8 | 6.19:1 | 4.5:1 | ✅ PASS |
| Text | Muted text on muted bg | `neutral.700` #585d63 | `neutral.100` #ebedef | 5.66:1 | 4.5:1 | ✅ PASS |
| Text | Hint/placeholder | `neutral.600` #6b7177 | `white` #ffffff | 4.94:1 | 4.5:1 | ✅ PASS |
| Text | REJECTED: neutral.500 as text | `neutral.500` #82888f | `white` #ffffff | 3.58:1 | 4.5:1 | ❌ FAIL |
| Text | Disabled text (exempt) | `neutral.400` #9ea4aa | `white` #ffffff | 2.52:1 | — | exempt |
| Brand text | Brand text / eyebrow | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 4.5:1 | ✅ PASS |
| Brand text | Brand text on brand tint | `primary.800` #0b562c | `primary.50` #f0faf2 | 8.26:1 | 4.5:1 | ✅ PASS |
| Brand text | Logo green as large text ≥24px / 18.66px bold | `brand.green` #4b9d66 | `white` #ffffff | 3.33:1 | 3:1 | ✅ PASS |
| Brand text | REJECTED: logo green as body text | `brand.green` #4b9d66 | `white` #ffffff | 3.33:1 | 4.5:1 | ❌ FAIL |
| Brand text | primary.600 as text (lightest green allowed for text) | `primary.600` #2f834e | `white` #ffffff | 4.69:1 | 4.5:1 | ✅ PASS |
| Links | Link on canvas | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 4.5:1 | ✅ PASS |
| Links | Link on subtle bg | `primary.700` #1b6d3c | `neutral.50` #f6f7f8 | 5.93:1 | 4.5:1 | ✅ PASS |
| Links | Link hover | `primary.800` #0b562c | `white` #ffffff | 8.82:1 | 4.5:1 | ✅ PASS |
| Links | Link vs surrounding body text (non-underlined needs 3:1; we underline) | `primary.700` #1b6d3c | `neutral.900` #32373d | 1.89:1 | — | exempt |
| Buttons | Primary button text | `white` #ffffff | `primary.700` #1b6d3c | 6.36:1 | 4.5:1 | ✅ PASS |
| Buttons | Primary button hover | `white` #ffffff | `primary.800` #0b562c | 8.82:1 | 4.5:1 | ✅ PASS |
| Buttons | Primary button boundary vs canvas | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 3:1 | ✅ PASS |
| Buttons | REJECTED: white on logo green | `white` #ffffff | `brand.green` #4b9d66 | 3.33:1 | 4.5:1 | ❌ FAIL |
| Buttons | Secondary (outline) button text | `primary.800` #0b562c | `white` #ffffff | 8.82:1 | 4.5:1 | ✅ PASS |
| Buttons | Secondary button border | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 3:1 | ✅ PASS |
| UI | Input border | `neutral.500` #82888f | `white` #ffffff | 3.58:1 | 3:1 | ✅ PASS |
| UI | REJECTED: neutral.300 as input border | `neutral.300` #bfc3c8 | `white` #ffffff | 1.77:1 | 3:1 | ❌ FAIL |
| UI | Focus ring on canvas | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 3:1 | ✅ PASS |
| UI | Focus ring on subtle bg | `primary.700` #1b6d3c | `neutral.50` #f6f7f8 | 5.93:1 | 3:1 | ✅ PASS |
| UI | Focus ring on brand band | `white` #ffffff | `primary.800` #0b562c | 8.82:1 | 3:1 | ✅ PASS |
| UI | Checkbox/radio checked fill | `primary.700` #1b6d3c | `white` #ffffff | 6.36:1 | 3:1 | ✅ PASS |
| UI | Decorative divider (exempt) | `neutral.200` #d8dbde | `white` #ffffff | 1.39:1 | — | exempt |
| UI | Brand rule (decorative, logo motif) | `brand.green` #4b9d66 | `white` #ffffff | 3.33:1 | — | exempt |
| Bands | Text on brand band (hero/CTA) | `white` #ffffff | `primary.800` #0b562c | 8.82:1 | 4.5:1 | ✅ PASS |
| Bands | Muted text on brand band | `primary.100` #dff3e4 | `primary.800` #0b562c | 7.59:1 | 4.5:1 | ✅ PASS |
| Bands | Text on dark brand band | `white` #ffffff | `primary.900` #064120 | 11.77:1 | 4.5:1 | ✅ PASS |
| Footer | Footer text | `neutral.200` #d8dbde | `neutral.950` #202326 | 11.36:1 | 4.5:1 | ✅ PASS |
| Footer | Footer heading | `white` #ffffff | `neutral.950` #202326 | 15.79:1 | 4.5:1 | ✅ PASS |
| Footer | Footer link | `primary.300` #9bd2a9 | `neutral.950` #202326 | 9.16:1 | 4.5:1 | ✅ PASS |
| Footer | Footer muted | `neutral.400` #9ea4aa | `neutral.950` #202326 | 6.27:1 | 4.5:1 | ✅ PASS |
| Logo | Logo green on white (logo, exempt; for reference) | `brand.green` #4b9d66 | `white` #ffffff | 3.33:1 | — | exempt |
| Logo | Reversed logo: green M on footer bg (exempt; for reference) | `brand.green` #4b9d66 | `neutral.950` #202326 | 4.75:1 | — | exempt |
| Logo | Reversed logo: green M on black (exempt; for reference) | `brand.green` #4b9d66 | `brand.ink` #000000 | 6.31:1 | — | exempt |
| Status | success alert text | `success.800` #1f5600 | `success.50` #f1faee | 8.22:1 | 4.5:1 | ✅ PASS |
| Status | success text on canvas | `success.700` #2c6d08 | `white` #ffffff | 6.37:1 | 4.5:1 | ✅ PASS |
| Status | success icon/border on success.50 | `success.600` #3e831f | `success.50` #f1faee | 4.39:1 | 3:1 | ✅ PASS |
| Status | white on success.700 (badge) | `white` #ffffff | `success.700` #2c6d08 | 6.37:1 | 4.5:1 | ✅ PASS |
| Status | warning alert text | `warning.800` #653e01 | `warning.50` #fff5ea | 8.69:1 | 4.5:1 | ✅ PASS |
| Status | warning text on canvas | `warning.700` #805001 | `white` #ffffff | 6.85:1 | 4.5:1 | ✅ PASS |
| Status | warning icon/border on warning.50 | `warning.600` #9b6200 | `warning.50` #fff5ea | 4.71:1 | 3:1 | ✅ PASS |
| Status | white on warning.700 (badge) | `white` #ffffff | `warning.700` #805001 | 6.85:1 | 4.5:1 | ✅ PASS |
| Status | error alert text | `error.800` #8b000b | `error.50` #fff4f2 | 9.26:1 | 4.5:1 | ✅ PASS |
| Status | error text on canvas | `error.700` #af0011 | `white` #ffffff | 7.42:1 | 4.5:1 | ✅ PASS |
| Status | error icon/border on error.50 | `error.600` #ce1a1f | `error.50` #fff4f2 | 5.14:1 | 3:1 | ✅ PASS |
| Status | white on error.700 (badge) | `white` #ffffff | `error.700` #af0011 | 7.42:1 | 4.5:1 | ✅ PASS |
| Status | info alert text | `info.800` #014b79 | `info.50` #f0f8ff | 8.57:1 | 4.5:1 | ✅ PASS |
| Status | info text on canvas | `info.700` #02619a | `white` #ffffff | 6.61:1 | 4.5:1 | ✅ PASS |
| Status | info icon/border on info.50 | `info.600` #0175ba | `info.50` #f0f8ff | 4.60:1 | 3:1 | ✅ PASS |
| Status | white on info.700 (badge) | `white` #ffffff | `info.700` #02619a | 6.61:1 | 4.5:1 | ✅ PASS |

**Summary:** 59 pairs: **48 PASS**, 4 FAIL (all of them REJECTED uses), 7 exempt. Every pair approved for use passes.
- **The logo green fails as text** (3.33:1). It stays as an accent: the logo, rules, and display text ≥24px. Green text and buttons use **`primary.700` `#1b6d3c`** (6.36:1 on white; white on it 6.36:1). `primary.600` `#2f834e` (4.69:1) is the lightest green allowed for text.
- White text on the logo green fails, so there are no `brand.green` buttons.
- Text on brand bands (white on primary.800) is 8.82:1. Footer links (primary.300 on neutral.950) are 9.16:1.
- The reversed logo's green M reaches 4.75:1 on the footer and 6.31:1 on black. Logos are exempt, but it stays clearly visible.

### 2.6 Dark theme: not recommended for Phase 1
Donation, receipt and legal pages gain little from a dark theme, and it roughly doubles visual QA and contrast checking. Because tokens have two layers (core scales → `semantic.*`), adding dark later only means a new set of alias values, with no component changes. The reversed logo files already exist.

## 3. Typography

**Decision (owner, 2026-10-21): Poppins everywhere.** Poppins is the face for English, Hindi and Marathi, for headings and body text. Admins can switch the site font later (see "Admin font setting" below).

| Token | Stack | Licence | Notes |
|---|---|---|---|
| `font.family.sans` | **Poppins**, system-ui, sans-serif | SIL OFL 1.1: self-hosting on the web is allowed | Geometric sans, close to the wordmark's construction. Latin + Devanagari in one family |
| `font.family.devanagari` | **Poppins**, Noto Sans Devanagari, sans-serif | SIL OFL 1.1 (both) | Hindi and Marathi use Poppins. Noto Sans Devanagari covers any rare conjunct Poppins lacks |
| `font.family.gujarati` | **Noto Sans Gujarati**, sans-serif | SIL OFL 1.1 | Poppins has **no Gujarati**, so Gujarati pages use Noto Sans Gujarati for Gujarati text and Poppins for any Latin text |

The logo wordmark itself is artwork (SVG) and keeps its own lettering whatever the site font is.

- **Loading (as built in Step 3):** Poppins is self-hosted from `public/fonts/poppins` (`src/styles/fonts.css`), in Latin, Latin-ext and Devanagari subsets, weights 400/500/600/700, `font-display: swap`, with a metric-matched fallback so text doesn't shift. The layout preloads Latin 400/600 on `/en` and `/gu`, and Devanagari 400/600 on `/hi` and `/mr`. Noto Sans Devanagari and Noto Sans Gujarati, and the admin font options (Mukta, Hind, Noto Sans), come from `next/font` and download only when used. Hindi/Marathi pages have a documented 3.0 s lab LCP budget (standards PERF-01).
- **Script selection:** `:lang(hi)`, `:lang(mr)` and `:lang(gu)` set the script's stack with the site font first, so Latin text inside Indic pages keeps the site font.
- **Sizes** (rem, base 16px): xs .75 · sm .875 · base 1 · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 · 4xl 2.25 · 5xl 3. Headings may use `clamp()` between two adjacent steps. Body text never goes below `base`.
- **Line-height:** Latin tight 1.2 / snug 1.35 / body 1.6 (Poppins has tall ascenders). **Indic** tight 1.4 / snug 1.55 / body 1.75, to leave room for matras and conjuncts.
- **Tracking:** `caps` 0.12em for uppercase eyebrows and labels, echoing the wordmark. **Never letter-space Indic scripts**, and never set long text in all caps.

### Admin font setting
Super Admins can change the site font in **Settings → Appearance** without a redeploy (spec §2 `appearance_settings`, §5).
- **Curated list only.** Every option is an OFL font self-hosted at build time that covers **Latin + Devanagari**. Options: Poppins (default), Mukta, Hind, Noto Sans (with Noto Sans Devanagari). Gujarati always uses Noto Sans Gujarati, because none of these has Gujarati. Adding an option is a code change: one `next/font` entry plus a visual check of all 4 locales.
- **How it works:** each option is declared with `next/font` and exposes its own CSS variable. The root layout reads the setting and sets `--font-sans` on `<html>` to the chosen option. Browsers download only the font files a page actually uses, so unused options cost nothing.
- **Safety:** the admin sees a live preview in all 4 scripts before saving. The change is audited and revalidates every public page. Sizes, line-heights and colours don't change with the font, so the contrast table stays valid.

## 4. Spacing, shape and motion
- **Space:** a 4px grid, from `space.1` (0.25rem) to `space.24` (6rem). Sections get generous vertical rhythm (`space.16`–`space.24` on desktop), echoing the logo's white space.
- **Radius:** none 0 · sm 2px (inputs, tags) · md 4px (buttons, alerts) · lg 8px (cards, images, dialogs) · full only for round trustee photos and avatars. No pill buttons, which keeps the crisp, classical look.
- **Borders and rules:** hairline 1px, input 1px, `rule` 2px. The logo motif is a short `border.rule` line above or below section headings. The footer opens with a full-width rule.
- **Shadow:** flat and print-like. `shadow.sm` (y 1, blur 2, slate 12%) for card hover; `shadow.md` (y 4, blur 12, slate 16%) for menus and dialogs. Tints and rules separate content before shadows do.
- **Targets and focus:** minimum 24px (WCAG 2.5.8); 44px for primary buttons, nav and mobile controls. Focus ring is 3px with a 2px offset, `focus.ring`.
- **Breakpoints:** sm 40rem · md 48rem · lg 64rem · xl 80rem. Max container width 80rem.
- **Motion:** fast 120ms · base 200ms · slow 320ms, with the standard easing `cubic-bezier(0.2,0,0,1)`. All non-essential motion is turned off under `prefers-reduced-motion: reduce`. No autoplay carousels.
- **Imagery:** real photos of the Trust's work, natural light and colour, people shown with dignity and consent (A7). No stock clichés, no heavy filters, no duotone. Rectangular crops with `radius.lg` at most; photos at the top of a public tile follow the tile's `radius.xl` corners.
- **Tiles (Oct 2026, owner's choice):** public cards (causes, events, news, albums, testimonials, impact numbers) use `radius.xl` (16px), a hairline border, a soft shadow on hover, an optional label badge on the photo (white on brand green, `radius.full`), an icon in a brand-subtle square beside the title, and a "… →" call to action. Only brand colours; the whole card is clickable through its title link.

## 5. Logo usage

### 5.1 Files (`brand/logo/`)
| File | Use |
|---|---|
| `mswt-logo-horizontal.svg` | **Primary logo** on white or light backgrounds (canvas, neutral.50, primary.50) |
| `mswt-logo-horizontal-reversed.svg` | On neutral.950, primary.900 or black: the S, bottom rule and wordmark turn white, the M stays green |
| `mswt-mark.svg` / `mswt-mark-reversed.svg` | Monogram with rules: social avatars, the receipt watermark, places where the name is already shown in text. 48px and up |
| `mswt-mark-compact.svg` / `-reversed.svg` | Monogram **without the rules** (they disappear at small sizes): favicon, PWA icons, below 48px |

### 5.2 Rules
- **Clear space:** keep at least **x = ¼ of the mark's height** empty on every side. For the horizontal logo the mark's height is the full logo height. No text, edges or other graphics inside that space.
- **Minimum size:** horizontal logo **200px wide** on screen (keeps the "WELFARE TRUST" cap height ≥8px) or **45mm** in print. Mark with rules: 48px / 12mm. Compact mark: 16px.
- **Backgrounds:** full-colour versions go on white, neutral.50 or primary.50 only. Reversed versions go on neutral.950, primary.900 or black. **Never** use either on mid greens (primary.300–700), where the M disappears, or on busy photos without a solid panel behind.
- **Don't:** stretch, rotate, recolour (for example an all-green logo), add effects or shadows, separate or rearrange the M and S, retype the wordmark in another font, or drop the rules from the full mark. Use the compact mark when space is tight.
- **Accessible name:** inline SVGs carry `<title>`. In the header and footer the logo is a link to `/{l}` named "MS Welfare Trust – home" (localised). There is one logo link per landmark, and decorative repeats use `alt=""`.

### 5.3 Where the logo appears (files generated in later steps)
| Placement | Source | Spec | Step |
|---|---|---|---|
| Header | horizontal | Height 40px mobile / 48px desktop (≥200px wide), links home | 3 |
| Footer | horizontal-reversed on `bg.inverse` | ≥200px wide | 3 |
| Favicon set | mark-compact | `icon.svg`, `favicon.ico` (16/32/48), `apple-icon.png` 180 on white with x padding | 3 |
| PWA icons | mark-compact | 192 and 512 `any` on white; 512 `maskable` with the mark inside the central 80% safe zone on white | 9 |
| Open Graph template | horizontal | 1200×630: white canvas, logo top-left at ≥200px, page title in the locale's font, a `brand.green` rule | 4 |
| 80G receipt PDF header | horizontal (vector) | ≥45mm wide, legal name, PAN and 80G number beside it. Must read well in greyscale print | 7 |
| Email header | horizontal PNG @2x | 600px email layout with a 240px-wide logo, alt text "Munira Shoaib Welfare Trust", white background (works in dark-mode clients) | 9 |
| JSON-LD `logo` | mark (square) | `https://mswelfaretrust.org/brand/mswt-logo-512.png`, 512×512 PNG on white (≥112×112 required), at a stable crawlable URL | 5 |
