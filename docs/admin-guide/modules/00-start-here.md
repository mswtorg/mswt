# Start here: the MS Welfare Trust admin

Who can use it: everyone with an admin account

The admin is where the Trust records donations, issues receipts and keeps the public website up to date. Open it at **mswelfaretrust.org/admin**. It is in English only and is never shown to search engines.

![The dashboard, the first screen after signing in](img/dashboard.jpg)

## The three roles

Every person has one role. The menu on the left only shows what your role may open, and the server checks again on every page and button, so a hidden link can never be used to get round it.

| Area | Super Admin | Accountant | Content Editor |
| --- | --- | --- | --- |
| Dashboard | Money and content | Money and content | Content only |
| Donations, offline entry, receipts | Yes | Yes | No |
| Donors | Yes (and merge) | Yes | No |
| Reports and downloads | Yes | Yes | No |
| Causes | Edit | Read only | Edit |
| Pages, events, news, testimonials, team, gallery, documents, media, menus | Edit | No | Edit |
| Messages from the contact form | Handle | Read only | Handle |
| Sample content | Yes | No | No |
| Settings: SEO | Yes | No | Yes |
| Settings: Organization, Payments, Email, Receipts, Appearance | Yes | No | No |
| Users | Yes | No | No |
| Audit log | Everyone's changes | Own changes | Own changes |

## Ideas that apply everywhere

- **Four languages.** Public text is written separately in English, Hindi (हिन्दी), Marathi (मराठी) and Gujarati (ગુજરાતી), using the language tabs at the top of each editor. A page never falls back to English: if the Hindi text is missing, the item simply does not appear on the Hindi site.
- **"Reviewed by a person: publish in this language".** On the live site, a language appears only after someone has read the text and ticked this box. Untick it to take that language off the site while you keep working.
- **Draft and Published.** A draft is never shown on the site, in any language.
- **Save, Discard and the bar at the bottom.** Long forms keep a bar at the bottom of the screen that says whether there are unsaved changes.
- **View page / View cause.** The button at the top right opens the public page in a new tab, so you can check your change.
- **Everything is recorded.** Every change is written to the audit log with your name and the time.
- **Photos come from the library.** Photo fields open the media library. "Upload new" adds a photo straight from your computer; you can also paste or drop one on the button.

## Learning safely

The **stage** site (mswt-git-stage-mswt.vercel.app) is a full copy of the admin with its own test database. Practise there first: nothing you do on stage reaches donors or the live site. The Super Admin can load **Sample content** on stage so every page has something to edit.

## The guides

Read **Signing in and your account** first, then the guides for your role:

- **Accountant:** Dashboard, Donations, Donors, Reports, Messages, Audit log.
- **Content Editor:** Dashboard, Pages, Causes, Events, News, Testimonials, Team, Gallery, Documents, Media, Menus, Messages, Settings (SEO), Audit log.
- **Super Admin:** all of them, plus Settings, Users and Sample content.
