# Donations and receipts

Who can use it: Super Admin and Accountant

Every donation, online (Cashfree) or offline (cash, cheque, bank transfer, UPI received directly), is in **Donations**. Each paid donation gets a receipt by email automatically.

## Two kinds of receipt

- **80G receipt** (number like MSWT/2026-27/000123): for a donor who gave their PAN and postal address. The donor can claim the tax deduction under section 80G.
- **Acknowledgement** (number like MSWT/ACK/2026-27/000002): a thank-you and proof of payment, without the tax certificate. Given when the donor did not ask for 80G or did not give PAN and address.

Online donations above the amount set in Settings → Payments (default ₹1,000) are always 80G: the donor must give PAN and address.

## Finding a donation

![The donations list with its filters](img/donations-list.jpg)

Search by name, email, phone, order number or receipt number. Narrow the list by **Financial year**, **Status**, **Mode**, **Receipt** (80G or Acknowledgement), **Cause**, dates or amount. The totals count only completed payments.

The **CSV** and **Excel** buttons download the filtered list.

## Recording an offline donation

Use this for money received directly by the Trust.

![Record offline donation](img/donations-new.jpg)

1. **Donations → + Offline donation** (or **Record offline donation** on the Dashboard).
2. **Donation:** amount in rupees, mode (cash, cheque, bank transfer, UPI), the date the Trust received it, and the cause (or General fund). For cheque, transfer or UPI, add the cheque no. / UTR, date and bank.
3. **Donor:** full name, email and mobile. A donor with the same PAN (or email and phone) is updated rather than duplicated.
4. **80G receipt:** tick **Issue an 80G receipt** and enter PAN and address, if the donor wants one.
5. **Save and issue receipt.** The receipt is created and emailed at once.

> **Cash above ₹2,000 cannot get an 80G receipt** (Income Tax rule). The form warns you and issues an acknowledgement.

Check the amount and name carefully before saving: a receipt number, once issued, is never reused.

## One donation in detail

![A donation's page](img/donations-detail.jpg)

The page shows the donor as recorded at the time, the payment, and all receipts for this donation. From here you can:

- **Resend receipt:** emails the same receipt again (for example to a donor who can't find it).
- **Void receipt:** cancels a receipt with a reason. Voided receipts keep their numbers and stay in the records.
- **Reissue receipt:** voids the current receipt and issues a new number (same financial year only) with corrected details. Use it when a donor sends their PAN later and wants 80G, or a name or address was wrong. Give a reason; it goes into the audit log.
- **Open donor:** goes to the donor's record.

## Seeing a full PAN

PANs are shown masked (XXXXXX234F). To see full PANs, press **Email me a code**, enter the 6-digit code from the email and **Show full PANs**. They stay visible for 15 minutes and then mask again; each unlock is recorded in the audit log. Only unlock them when you really need them.

## Things to remember

- The bank or Cashfree confirmation is the truth, never what a donor says on the phone. An online donation is "paid" only when Cashfree confirms it.
- Never write a PAN in notes, emails or messages.
- If a receipt email fails, the system retries automatically every night.
