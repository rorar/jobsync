> **[SUPERSEDED → docs/BACKLOG.md]** (2026-05-31) — Status VERALTET. Gap-2/3/4 code-verifiziert
> erledigt. Echt offen: Gap-1/5/6/7 (BACKLOG §5). Nur Historie.

# GAP-Analyse: Twenty CRM → JobSync CRM

Erstellt: 2026-05-10
Referenz-Spec: `specs/reference-twenty-crm.allium`
JobSync-Spec: `specs/crm.allium`

## Methodik

Systematischer Vergleich jedes Twenty-Konstrukts gegen:
1. crm.allium Spec (was spezifiziert ist)
2. Implementation (was gebaut ist)
3. ROADMAP (was geplant ist)

Klassifikation:
- ✅ DONE — implementiert und aligned
- 🔶 PARTIAL — teilweise implementiert, Lücken
- 🔲 PLANNED — in ROADMAP aber nicht implementiert
- ❌ GAP — Twenty hat es, wir haben es weder implementiert noch geplant
- ⏭️ N/A — nicht relevant für JobSync

---

## 1. Core CRM Entities

### Person

| Twenty-Feld | JobSync Status | Gap |
|---|---|---|
| name: FullName | ✅ firstName/lastName | — |
| emails: List\<TypedEmail\> | ✅ JSON array | — |
| phones: List\<TypedPhone\> | ✅ JSON array | — |
| linkedin_link: Links | 🔶 linkedinUrl: String | Twenty nutzt Links (primary_url + secondary_urls). Wir haben nur einen String. ROADMAP 5.7 plant socialProfiles. |
| x_link: Links | ❌ | Kein Twitter/X-Link. socialProfiles würde das lösen. |
| job_title: String | 🔶 jobTitle: String | Diskussion offen: headline vs. role-per-company |
| city: String | ✅ addressCity | Wir haben volle Adresse (besser als Twenty) |
| avatar_url: String | ✅ avatarUrl | Upload-Mechanismus fehlt |
| position: Integer | ❌ | Sort-Position für Listen. Nicht kritisch. |
| created_by: ActorMetadata | ✅ createdBySource + createdByName | — |
| updated_by: ActorMetadata | ❌ | Kein Tracking wer zuletzt geändert hat |
| company: Company | ✅→🔶 companies: List\<CompanyAssociation\> | Wir sind BESSER (N:M vs. Twenty's 1:1) |
| task_targets | ✅ CrmTaskTarget | — |
| note_targets | ✅ CrmNoteTarget | — |
| message_participants | 🔲 | ROADMAP 1.12 (Communication Connector) |
| calendar_event_participants | 🔲 | ROADMAP 1.7 (Calendar Connector) |
| timeline_activities | ✅ CrmActivityLog | — |
| opportunities_as_point_of_contact | 🔶 | Twenty: Person ist "point of contact" für Opportunity (=Job). Wir haben CrmInterview.personId aber keine direkte Person→Job Kontakt-Zuordnung. |

### Company

| Twenty-Feld | JobSync Status | Gap |
|---|---|---|
| name | ✅ label | — |
| domain_name: Links | ❌ | Kein Domain-Tracking. Wichtig für Email-Domain-Matching (5.7). |
| employees: Integer | ❌ | Nicht kritisch |
| linkedin_link: Links | ❌ | Siehe socialProfiles |
| annual_recurring_revenue | ⏭️ N/A | Sales-CRM-Feld, irrelevant für Job-Suche |
| address: Address | ❌ | Company hat keine Adresse. Könnte nützlich sein für Vor-Ort-Interviews. |
| ideal_customer_profile | ⏭️ N/A | Sales-Konzept |
| account_owner: WorkspaceMember | ⏭️ N/A | Multi-User, irrelevant |
| people: Set\<Person\> | 🔶 | Via CompanyAssociation ableitbar, aber kein direkter Back-Relation-Query |
| task_targets, note_targets | ✅ | — |
| opportunities: Set\<Opportunity\> | ✅ | Job.companyId existiert |
| timeline_activities | ❌ | Timeline nur für Person, nicht für Company. Twenty hat beides. |

### Opportunity (= Job in JobSync)

| Twenty-Feld | JobSync Status | Gap |
|---|---|---|
| name | ✅ JobTitle.label | — |
| amount: Currency | ✅ salaryRange | — |
| close_date | ✅ dueDate | — |
| stage | ✅ statusId (State Machine) | Wir sind BESSER (validierte Transitions) |
| point_of_contact: Person | ❌ **CRITICAL GAP** | Twenty: Jeder Job hat einen Ansprechpartner (Person). Wir haben das nicht. Das ist genau die "HR-Kontakt für diesen Job" Lücke. |
| company | ✅ companyId | — |
| task_targets, note_targets | ✅ CrmTaskTarget/NoteTarget | — |
| timeline_activities | 🔶 | JobStatusHistory + CrmActivityLog, aber nicht unifiziert pro Job |

---

## 2. Activities: Notes & Tasks

### Note

| Twenty | JobSync | Gap |
|---|---|---|
| title | ✅ title | — |
| body_v2: RichText | ❌ | Wir haben plain text body. Twenty nutzt Block-Editor (Tiptap/Lexical). |
| position: Integer | ❌ | Sort-Position |
| created_by/updated_by: ActorMetadata | ❌ | Kein Actor-Tracking auf Notes |
| note_targets | ✅ CrmNoteTarget | — |

### Task

| Twenty | JobSync | Gap |
|---|---|---|
| title | ✅ | — |
| body_v2: RichText | ❌ | Plain text description |
| due_at | ✅ dueDate | — |
| status | ✅ status (State Machine) | Wir sind BESSER (validierte Transitions) |
| assignee: WorkspaceMember | ⏭️ N/A | Multi-User |
| task_targets | ✅ | — |

---

## 3. Timeline

| Twenty | JobSync | Gap |
|---|---|---|
| TimelineActivity Entity | ✅ CrmActivityLog | — |
| Polymorphic targets (Person/Company/Opportunity/Note/Task/Workflow) | 🔶 | Wir haben nur Person. Twenty hat auch Company, Job (Opportunity), Note, Task. |
| linked_record_cached_name | ✅ linkedRecordName | — |
| Materialized from database events | ✅ | Via EventBus Consumer |
| Timeline auf Company | ❌ | Nur auf Person. Twenty zeigt Timeline auch auf Company-Detail. |
| Timeline auf Job (Opportunity) | 🔶 | JobStatusHistory existiert, aber nicht im CrmActivityLog unifiziert. |

---

## 4. Messaging (Email Integration)

| Twenty | JobSync | Gap |
|---|---|---|
| ConnectedAccount | ✅ (structural) | Entity existiert, keine Logik |
| MessageChannel (sync config) | 🔲 ROADMAP 1.12 | — |
| MessageThread/Message | 🔲 ROADMAP 1.12 | — |
| MessageParticipant (email→Person matching) | 🔲 ROADMAP 1.12 | — |
| Sync State Machine (stages) | 🔲 | Twenty's Multi-Stage-Pipeline. Unser Connector-Resilience (Cockatiel) deckt Retry/CB ab, aber nicht den Staging-Pipeline-Ansatz. |
| Contact Auto-Creation Policy | 🔲 | sent_and_received / sent / none Konfiguration |
| Blocklist filtering during import | ✅ (foundation) | CrmBlocklist Entity existiert, Import-Logik fehlt |

---

## 5. Calendar

| Twenty | JobSync | Gap |
|---|---|---|
| CalendarChannel | 🔲 ROADMAP 1.7 | — |
| CalendarEvent | 🔶 | CrmInterview ist ein manueller Spezialfall. Twenty synct echte Kalender-Events. |
| CalendarEventParticipant | 🔲 | — |
| Sync State Machine | 🔲 | — |
| Contact Auto-Creation from calendar | 🔲 | — |

---

## 6. Attachments

| Twenty | JobSync | Gap |
|---|---|---|
| Attachment Entity (polymorphic) | 🔲 ROADMAP 5.5 | — |
| target_person/company/opportunity | 🔲 | — |
| File management | 🔲 ROADMAP 2.8 | Dateiexplorer |

---

## 7. Blocklist

| Twenty | JobSync | Gap |
|---|---|---|
| handle: String | ✅ | — |
| workspace_member scoping | ✅ userId | — |
| Domain patterns (@example.com) | ❌ | Wir speichern nur exact handles, kein Domain-Pattern-Matching |
| Filtering during sync import | 🔲 | Foundation da, Import fehlt |

---

## 8. View (Saved Perspectives)

| Twenty | JobSync | Gap |
|---|---|---|
| View Entity (table/kanban/calendar) | 🔶 | KanbanBoard für Jobs existiert, aber kein generisches View-System |
| ViewField/Filter/Sort/Group | ❌ | Hardcoded pro Komponente |
| View per entity type | ❌ | Kein View für Contacts, keine saved filters |
| view_visibility (public/private) | ⏭️ N/A | Single-user |

---

## 9. Workflow Engine

| Twenty | JobSync | Gap |
|---|---|---|
| Workflow/Version/Run/Trigger | ⏭️ | Twenty's Workflow ist ein generischer Automation-Builder. JobSync hat Automations (Scheduler + Runner) die spezifisch für Job-Discovery sind. Kein generischer Workflow-Engine geplant. |
| DATABASE_EVENT trigger | ✅ | Via TypedEventBus |
| CRON trigger | ✅ | Scheduler |
| MANUAL trigger | ✅ | Manual runs |
| WEBHOOK trigger | ❌ | Nicht als Automation-Trigger |

---

## Wo wir besser sind als Twenty

- **Companies N:M** — Twenty hat nur 1:1, wir haben CompanyAssociation mit role + temporal bounds
- **Status State Machine** — validierte Transitions mit Allium-Spec, Twenty hat loose strings
- **GDPR-Felder** — data_source, processing_basis, retention_expires_at direkt auf Person
- **Volle Adresse** — street, city, postalCode, country statt nur city

---

## CRITICAL GAPS (sofort relevant)

### 1. Person → Job Zuordnung ("Point of Contact") ⭐⭐⭐

**Twenty:** `Opportunity.point_of_contact: Person?`
**JobSync:** Keine direkte Person→Job Relation. CrmInterview verknüpft Person+Job, aber nur für Interviews, nicht als genereller "Ansprechpartner".
**Impact:** Das ist genau der HR-Use-Case. "Lisa Müller ist mein Kontakt für 3 Jobs bei Acme."
**Lösung:** `Job.contactPersonId: Person?` oder besser eine N:M Relation (ein Job kann mehrere Kontakte haben).

### 2. Company.domain_name ⭐⭐⭐

**Twenty:** `Company.domain_name: Links` — ermöglicht Email-Domain→Company Matching
**JobSync:** Company hat kein Domain-Feld.
**Impact:** Ohne Domain-Matching kann 5.7 (Contact Extraction) nicht "email@acme.com" → "Acme GmbH" auflösen.
**Lösung:** `Company.domain: String?` hinzufügen.

### 3. job_title → headline + role Trennung ⭐⭐

**Twenty:** `Person.job_title` + implizit über Company-Relation
**JobSync:** `Person.jobTitle` + `CompanyAssociation.role` — beide heißen "Job Title" in der UI
**Impact:** UX-Verwirrung, Dateninkonsistenz
**Lösung:** Position C: `jobTitle` → `headline`

### 4. Timeline auf Company und Job ⭐⭐

**Twenty:** TimelineActivity targets: Person, Company, Opportunity, Note, Task, Workflow
**JobSync:** CrmActivityLog nur targetPersonId. targetJobId existiert aber wird in der UI nicht als eigene Timeline angezeigt.
**Impact:** Kein Aktivitäts-Feed auf Company-Detail oder Job-Detail Seite.
**Lösung:** CrmActivityLog targets erweitern + UI für Company/Job Timeline.

### 5. Social Links (Links value type) ⭐⭐

**Twenty:** `linkedin_link: Links`, `x_link: Links` — strukturiertes Link-Modell
**JobSync:** `linkedinUrl: String?` — single flacher String
**Impact:** Kein Support für XING, GitHub, Twitter. ROADMAP 5.7 plant socialProfiles.
**Lösung:** `socialProfiles: List<SocialProfile>` (bereits in ROADMAP vermerkt)

### 6. Blocklist Domain-Pattern-Matching ⭐

**Twenty:** `@example.com` matcht alle Emails der Domain
**JobSync:** Nur exakte Handle-Matches
**Impact:** Man muss jede Email einzeln blockieren statt die ganze Domain.
**Lösung:** `type: domain` + Pattern-Matching im Query.

### 7. updated_by Actor Tracking ⭐

**Twenty:** `updated_by: ActorMetadata` auf Person, Company, Note, Task
**JobSync:** Nur `created_by`, kein `updated_by`
**Impact:** Kein Audit-Trail wer/was zuletzt geändert hat.
**Lösung:** `updatedBySource` + `updatedByName` auf Person.

---

## Dependency Map: Gaps → ROADMAP

```
Gap 2: Company.domain ─────┬──→ ROADMAP 5.7 Contact Extraction
                           │     (email domain → Company Matching)
                           ├──→ ROADMAP 1.12 Communication Connector
                           │     (AutoCreatePerson → find_company_by_domain)
                           └──→ Gap 6: Blocklist Domain-Pattern
                                  └──→ ROADMAP 1.12 (Blocklist during sync)

Gap 4: Social Profiles ────┬──→ ROADMAP 5.7 Profile URL Auto-Fill
                           │     (LinkedIn/XING Import braucht socialProfiles)
                           └──→ ROADMAP 5.8 Import
                                  (LinkedIn/XING/vCard Import)

Gap 3: headline vs. role ──┬──→ ROADMAP 5.7 Profile URL Auto-Fill
                           │     (LinkedIn Headline ≠ Position)
                           └──→ Gap 4 (Social Profiles braucht klare Trennung)

Gap 1: Point of Contact ───┬──→ ROADMAP 5.1 Communication
                           │     ("Wer ist Ansprechpartner für diesen Job?")
                           ├──→ ROADMAP 5.4 Reminders
                           │     ("Erinnere mich, Lisa wegen Job X zu kontaktieren")
                           └──→ ROADMAP 5.7 Contact Extraction
                                  (Extrahierte Kontakte → Jobs zuordnen)

Gap 5: Timeline Company+Job ──→ ROADMAP 5.1 Communication
                           │     (Email-Timeline auf Company/Job)
                           └──→ ROADMAP 5.9 (Spec sagt "pro Kontakt UND Unternehmen")

Gap 7: updated_by ─────────┬──→ ROADMAP 1.12 (Track "Email-Sync hat Kontakt aktualisiert")
                           └──→ ROADMAP 5.7 (Track "System hat Kontakt auto-angereichert")
```

## Drei strategische Ketten

| Kette | Gaps | Bereitet vor | Essenz |
|-------|------|-------------|--------|
| **A: Sync Foundation** | 2 → 6 → 7 | ROADMAP 1.7 + 1.12 | Ohne Company.domain und Blocklist Domain-Pattern kann kein Email/Calendar-Sync Contact-Auto-Creation machen |
| **B: Extraction Foundation** | 3 → 4 + 2 | ROADMAP 5.7 | Ohne headline-Trennung, socialProfiles und Company.domain kann Profile Auto-Fill nicht funktionieren |
| **C: Relationship Triangle** | 1 → 5 | ROADMAP 5.1 + 5.4 | Ohne Person↔Job Zuordnung und Timeline auf Job/Company fehlt die CRM-Kernfunktion |

## Priorisierte Umsetzungsreihenfolge

| Prio | Gap | Aufwand | ROADMAP |
|------|-----|---------|---------|
| 1 | Person→Job "Point of Contact" | M | 5.5 |
| 2 | Company.domain für Email-Matching | S | 5.7 Vorbereitung |
| 3 | headline vs. role Trennung | S | 5.5 |
| 4 | Social Profiles (linkedinUrl → socialProfiles) | M | 5.7 |
| 5 | Timeline auf Company + Job | M | 5.9 |
| 6 | Blocklist Domain-Pattern | S | 5.5 |
| 7 | updated_by Actor Tracking | S | 5.5 |
| 8 | Rich Text Notes (Tiptap) | L | Future |
| 9 | Saved Views | L | Future |
