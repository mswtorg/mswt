# Settings

Who can use it: Super Admin (SEO: also Content Editor)

Settings hold the Trust's facts and how the site behaves. Changes take effect on the site within moments and are recorded in the audit log.

## Organization

![Organization settings](img/settings-organization.jpg)

- **Identity:** legal name, short name, year founded, other names.
- **Registrations:** Trust PAN, registration number, 12A and 80G numbers and dates. They are printed on every receipt, so leave a field empty until it is confirmed.
- **Address & contact:** shown on the Contact page and to search engines.
- **Signatory:** the name, designation and signature printed on receipts.

Team members are no longer here: they are in **Content → Team**.

## SEO

![SEO settings](img/settings-seo.jpg)

The page title pattern (%s is replaced by each page's title), the default description, and verification codes from Google Search Console and Bing.

## Appearance

![Appearance](img/settings-appearance.jpg)

The font for English, Hindi and Marathi text on the public site.

## Payments

![Payment settings](img/settings-payments.jpg)

- **Donation amounts:** minimum, maximum online donation and the suggested amounts on the donate form.
- **PAN required above (₹):** every online donation above this amount is an 80G donation: the 80G box is ticked and locked, and PAN and postal address are required. Default ₹1,000.
- **Payment charges:** let donors add the gateway fee to their donation.
- **Home page:** show the quick donate box on Home.

### Bank transfer, UPI and cheque

The details donors use to pay the Trust directly. They appear on the Donate page (with a link from Contact) once **Show these details on the site** is ticked, even while online donations are off.

- **Account name, Account number, IFSC:** all three together. The IFSC is 11 characters, e.g. SBIN0001234. Spaces in the account number are removed.
- **Account type, Bank, Branch:** optional.
- **UPI ID:** e.g. mswelfaretrust@sbi. The site makes the QR code from it, so there is no image to upload.
- **Cheque / DD in favour of:** cheques are posted to the address in Organization settings.
- **Donors email their details to:** where donors send their name, PAN, address and transaction number to get a receipt. Empty uses the Organization email.

> **Every change to these details is emailed to all admin alert recipients.** If you get that email and nobody agreed the change, change the details back and reset that admin's password at once: a swapped account number is a common fraud.

Check every digit after saving: open the Donate page, scan the QR code with your own UPI app, and confirm the payee name is the Trust's.

## Email

![Email settings](img/settings-email.jpg)

- **Sender:** the name and address receipts come from, and where replies go.
- **Admin alerts:** who receives alerts (failed payments, new messages, the daily summary every morning, and "Job failed" if the nightly check breaks). One email per line.
- **Send yesterday's summary now:** a test that the email works.

## Receipts

![Receipt templates](img/settings-receipts.jpg)

The templates for the **80G receipt (PDF)**, the **Acknowledgement (PDF)** and the **Receipt email**. The preview shows the result as you edit. **Reset to the built-in template** puts back the original.

The 80G receipt wording is a legal document: change it only with the CA's approval.
