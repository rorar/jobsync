# CRM & Contacts — User Guide

JobSync includes a lightweight CRM so you can track the **people** and
**companies** behind your applications — recruiters, hiring managers, agencies —
right next to the jobs they relate to. This guide covers the three connected
features: **Contacts**, the **Point of Contact** on a job, the **Recruiter
triangle**, and the **CRM activity timeline**.

> All CRM data is private to your account. Contacts are never shared between
> users, and every record is scoped to you.

---

## 1. Contacts

Open **Dashboard → Contacts** to see everyone you have saved. Each contact is a
person — a recruiter, a hiring manager, a referral, anyone relevant to your
search.

### Adding a contact

1. Click **Add Contact**.
2. Fill in at least a **first name**, **last name**, and **one email address**
   (the email is required).
3. Optionally set a **country** — this powers the holiday/timezone hint on the
   contact's page (see below).
4. Click **Add Contact** to save.

### The contact page

Click any contact to open its detail page. It is organised into tabs:

| Tab | What it shows |
|-----|---------------|
| **Overview** | Name, email(s), phone, address, and a holiday badge |
| **Interviews** | Interviews logged against this person |
| **Tasks** | Follow-ups and to-dos linked to this person |
| **Notes** | Free-text notes |
| **Related Jobs** | Every job where this person is the point of contact |
| **Timeline** | A unified, chronological feed of all activity (see §4) |

**Holiday / timezone hint:** if you set a contact's country, the Overview tab
shows a small badge when *today* is a public holiday or weekend in that country
— a quick cue that an immediate reply may be unlikely.

### Archiving and anonymising (GDPR)

Contacts are **never hard-deleted** — this is a deliberate data-protection
design choice.

- **Archive** hides a contact from your active list. Use **Reactivate** to
  restore it. Nothing is lost.
- **Anonymise** (the shield icon) permanently strips the personal details
  (name, email, phone, address) while keeping the relationship history intact
  and unidentifiable. Use this to honour a "right to erasure" request without
  breaking the timeline of jobs the contact touched.

### Withdrawing consent (GDPR Art. 7(3))

If a contact's **processing basis** is **Consent**, the contact page shows a
**Withdraw consent** button. When a contact asks you to stop processing their
data, click it — the contact gets a red **"Consent withdrawn"** badge and
becomes **processing-restricted**. While restricted, you **cannot**:

- edit the contact's fields,
- schedule a new interview naming them,
- create a task or note targeting them,
- and JobSync's automatic reminders skip them (interview reminders and
  overdue-task reminders).

What you **can** still do: **export** the contact (a data-access/portability
request — the export records the withdrawal date), **anonymise/erase** them, and
**delete** them. Withdrawal is **not retroactive** — anything recorded before is
kept. The button flips to **Reinstate consent** so you can lift the restriction
later if the contact re-consents.

> Contacts on a *Legitimate Interest* or *Contract* basis don't show these
> controls — withdrawal only applies to consent-based records.

---

## 2. Point of Contact on a job

When you add or track a job you can link the **person you are dealing with** for
that role.

1. In **Add Job**, scroll to **Point of Contact**.
2. Start typing in the contact picker — it searches across **name, email,
   company, and role**, so "acme", "jane@", or "recruiter" all work.
3. Pick the person, then optionally type their **role** for this job (e.g.
   *Recruiter*, *Hiring Manager*).

Once saved, the link appears in two places:

- On the **job**, the contact is shown as its point of contact.
- On the **contact's** page, the job appears under **Related Jobs**.

> The point of contact is optional and can only be set when creating a job. If
> you do not have the person saved yet, add them under **Contacts** first.

---

## 3. Recruiter triangle (who you actually applied through)

Many applications go through a **recruiting or staffing agency** rather than
straight to the employer. The recruiter triangle captures this so your records
reflect reality.

In **Add Job** (create *or* edit), two optional fields sit together:

- **Recruiting Agency** — the agency handling the role. You can pick an existing
  company or type a new name to create it on the spot.
- **Relationship** — how you reached this job:

  | Relationship | Meaning |
  |--------------|---------|
  | **Direct employer** | You applied straight to the hiring company |
  | **Recruiting agency** | A recruiter is placing you for a permanent role |
  | **Staffing agency** | A staffing/temp agency owns the engagement |

The **hiring company** stays in the normal **Company** field; the agency is
recorded separately. This keeps "who the job is *for*" distinct from "who you
went *through*".

---

## 4. CRM activity timeline

Both **jobs** and **contacts** show a **Timeline** — a single chronological feed
that merges everything relevant in one place:

- Interviews scheduled or completed
- Tasks created or finished
- Notes added
- Status changes on the linked job

On a **contact's** page the timeline gathers activity across *all* their related
jobs. On a **job's** page (the CRM section in Job Details) it shows activity for
that job and the people connected to it. You never have to stitch the story
together by hand — the timeline does it for you.

---

## Tips

- **Save the recruiter as a contact too.** Then you get a Related-Jobs view per
  recruiter and a per-person timeline, not just the agency on the job.
- **Use the role field.** "Recruiter" vs "Hiring Manager" makes the picker
  search and your records far easier to scan later.
- **Set countries on contacts you call.** The holiday badge saves you from
  chasing a reply on someone's national holiday.
