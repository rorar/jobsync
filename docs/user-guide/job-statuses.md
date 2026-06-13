# Job Statuses (Custom Statuses & the Kanban board)

JobSync lets you tailor the statuses your applications move through. Each status
belongs to a **stage** that decides its colour, whether it counts as a submitted
application, and where it sits on the Kanban board.

## The seven stages

Every status lives in one of seven fixed stages (you cannot add stages, but you can
rename/recolour them and add as many statuses as you like inside each):

| Stage | Meaning | Counts as applied? |
|---|---|---|
| **Lead** | Bookmarked / pre-application backlog | No |
| **Applied** | Application submitted | Yes |
| **Interviewing** | In an interview process (one or more rounds) | Yes |
| **Offer** | An offer is on the table | Yes |
| **Won** | Offer accepted (the only truly terminal stage) | Yes |
| **Lost** | Rejected or declined (collapsed by default) | No |
| **Archived** | No longer tracked / listing expired (collapsed by default) | No |

The stage — not the status name — drives everything, so any custom status you create
behaves correctly.

## Managing statuses

Open **Settings → Job Statuses** (or the **Manage statuses** button on the My Jobs
page). From there you can:

- **Add** a status: type a name, pick its stage, and click *Add status*.
- **Rename / move stage**: the pencil icon. Moving a status into an applied stage
  (Applied / Interviewing / Offer / Won) marks its existing jobs as submitted
  applications — you'll see an impact warning before confirming.
- **Reorder** within a stage: drag the handle, or use the up/down arrows.
- **Set default**: the star icon. New jobs start in the default status (one per user).
- **Delete**: the trash icon. If no jobs use the status it's removed after a quick
  confirm. If jobs use it, you'll be asked to pick another status to **move them to**
  first — no job ever loses its status. The default status and your last remaining
  status can't be deleted.

> A soft limit of ~12 statuses keeps the Kanban readable — past that you'll see a
> warning, but you're not blocked.

## Choosing a status on a job

In the Add/Edit Job form the **Status** picker is grouped by stage. Picking an
applied-stage status automatically marks the job as *Applied* and sets the applied
date (you can still edit the date). There's no separate "applied" toggle — the status
is the single source of truth.

## How status changes are validated

You can move a job **forward or sideways** freely (e.g. straight from Lead to Won, or
between two statuses in the same stage). To move a **closed** job (Won / Lost /
Archived) back into play, it returns to the **Lead** stage — it can't jump straight
back into, say, Offer. This keeps your pipeline history meaningful.

## The Kanban board

On **My Jobs**, switch to the **Kanban** view. Columns are your statuses, ordered by
stage then by your custom order, coloured by their stage. Lost and Archived columns
collapse by default (your expand/collapse choices are remembered). Drag a card between
columns to change its status; the dashboard pipeline funnel and the status-history
timeline use the same stage colours.
