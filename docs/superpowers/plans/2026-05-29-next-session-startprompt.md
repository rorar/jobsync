# JobSync — Next-Session Startprompt (aktualisiert 2026-05-29)

> Aktualisierte Fassung von `/tmp/jobsync-next-session-startprompt.md`. Eingearbeitet sind
> die in der Session 2026-05-29 **gegen den Code verifizierten** Befunde (Webhook-Filterung
> 1c bereits erledigt; vollständige Flashlight-Egress-Inventur; korrigierter Sprint-Scope).
> Verifizierte Aussagen sind mit ✅ **[verifiziert 2026-05-29]** markiert.

Hey Claude, sei mein Full-Stack Senior Software Engineer für JobSync (TypeScript,
Next.js 15, Prisma/SQLite, Shadcn/Tailwind).

---

## [ ] Kontext lesen — @projekte/jobsync, in dieser Reihenfolge

1. CLAUDE.md + reminders
2. Memories: `~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md`
   UND `~/.claude/projects/-home-pascal/memory/MEMORY.md`
3. Handoff: `.remember/remember.md` — lies BESONDERS den Block
   „SESSION HANDOFF — 2026-05-29 close" (ganz unten): konsolidierter
   Open/Deferred-Index + Meta-Lektion.
4. Follow-up-Doc: `docs/superpowers/plans/2026-05-28-next-session-followups.md`
5. Backlog-Referenz: `project_deferred_sprints_for_future_sessions.md` + `docs/BUGS.md`
   + `docs/NOT-PLANNED.md`
6. **DIESES Dokument** — die Egress-Inventur unten ersetzt die veralteten 1c-Annahmen.

---

## [ ] Kritische Regeln laden + als Bestätigung schreiben

- **Nachhaltigkeitsprinzip** (nie der einfachste Weg; ROADMAP/DDD/Allium befragen)
- **META-LEKTION: Memory-/Planning-Indizes hinken dem Code hinterher.** Bevor du ein
  „deferred"/„CRITICAL"-Item startest, ZUERST gegen den aktuellen Code verifizieren.
  - Letzte Session: 3 „P0 CRITICAL" waren längst erledigt.
  - **Diese Session: Option 1c (Webhook ungefiltert) war ebenfalls längst erledigt** —
    siehe Egress-Inventur. Die META-LEKTION gilt in BEIDE Richtungen: weder einem
    veralteten „offen" blind vertrauen, noch vorschnell „erledigt" aus einem einzigen
    Grep schließen — den ganzen Surface sweepen.
- **Flashlight PFLICHT: nach jedem Pattern-Fix projektweit greppen, nicht nur den Diff.**
  (Letzte Session fand so den größten S3-Leak im Automation-Runner.)
- **Handoff/Memory-Dateien: NUR mit Edit anhängen, NIE mit Write überschreiben**
  (`feedback_minimal_edits` — mehrfach verletzt). Neue Dateien anlegen ist ok.
- **Honesty Gate PFLICHT vor jedem Push** (nie danach). Tests ressourcenschonend
  (`nice -n 10`, `--maxWorkers=1`, nie Tests+Build parallel); Server vor `tsc` stoppen.
- **@rorar** verwenden, keine Upstream-PRs (nur `origin/main`, Fork `rorar/jobsync`).
- **E2E auf der NixOS-VM:** Dev-Server via `scripts/dev.sh` starten (patcht Prisma-Engine;
  `bun run dev` allein scheitert an `linux-nixos`), `source scripts/env.sh` auch für
  den Playwright-Runner; Auth-Rate-Limit trippt bei wiederholten global-setup-Logins.
  Dev-Server nie stoppen (`reuseExistingServer: true`).
- **Skills statt improvisierter Agents:** `/full-stack-orchestration:full-stack-feature`
  für ALLE Entwicklung; bei UI zuerst ui-design-Agenten; bei GDPR `/gdpr-data-handling`.

---

## [ ] Stand ✅ [verifiziert 2026-05-29]

- **GDPR S3 + D-TZ + A-Leftovers DONE & gepusht** — 5 Commits `803212b..3bb7117`,
  `origin/main…main = 0/0` (sync bestätigt). 254 Suites / 5017 Tests grün, tsc 0, E2E 9/9.
- Arbeitsbaum: nur Scratch-/Artefakt-Dateien (`.full-review/`, `.tdd-cycle/`, `.remember/`)
  + bekannte untracked Docs — wie im Handoff beschrieben, nichts Verlorenes.

---

## [ ] FLASHLIGHT: PII-Egress-Surface — vollständige Inventur ✅ [verifiziert 2026-05-29]

Projektweiter Sweep JEDES ausgehenden Calls in `src/`. **Der echte Egress-Punkt** ist
durchgängig das Vercel-AI-SDK (`ai`): `streamText` (Routes) / `generateText` (Runner).
Genau **3 AI-Call-Sites**, gespeist von **2 Konverter-Funktionen**.

| Senke (file:line) | Was verlässt die App | An wen | Redaktion | Verdikt |
|---|---|---|---|---|
| `api/ai/resume/match/route.ts:111` (`streamText`) | Resume- + Job-Text | OpenAI/DeepSeek (cloud) / Ollama (lokal) | `stripPii=!isLocal` → `preprocessResume`+`preprocessJob` | ✅ gated |
| `api/ai/resume/review/route.ts:84` (`streamText`) | Resume-Text | dito | `stripPii=!isLocal` → `preprocessResume` | ✅ gated |
| `job-discovery/runner.ts:762` (`generateText`) | Resume- + inline Job-Text, **pro Scheduler-Run** | User-AI-Modul (cloud-fähig) | `stripPii=!isLocal` → `convertResumeForMatch`+`scrub` | ✅ gated (seit GDPR S3) |
| `notifications/channels/webhook.channel.ts:361` | `notification.data` | beliebige User-URL (3rd party) | `filterWebhookData()` **Allowlist** (19 Felder, getestet) | ✅ **gefiltert (1c DONE)** |
| `notifications/channels/push.channel.ts:96` | `notification.message` | FCM/Mozilla | web-push **E2E-verschlüsselt** (p256dh/auth) | ✅ blindes Relay |
| `email.channel.ts:91`, `account.actions.ts:139`, `smtp.actions.ts:313` | Notification-Body | **eigene** User-SMTP | eigener Auftragsverarbeiter | ✅ kein Dritt-Disclosure |
| `api/esco/*`, `api/eures/*` | Suchbegriff + Locale + NUTS | europa.eu | — | ✅ keine personenbez. Daten |
| `logoCheck.actions.ts`, meta-parser | Company-Domain/URL | Logo.dev/Google/Ziel-URL | — | ✅ nicht personenbezogen |
| EURES/AA/JSearch-Module | Such-Keywords + Ort (Automation-Config) | Job-Boards | — | ✅ kein User-PII |

**Schlussfolgerung:** **Keine 4. ungesicherte Egress-Senke.** Alle drei Achsen
(AI-Transfer, Notification, Reference/Discovery) sind abgedeckt. Der Egress-Sprint hat
KEIN verstecktes Mehr-Volumen.

### Die echte Divergenz (Kern von 1a) — belegt

Beide Resume-Konverter redigieren strukturiert (`[NAME]/[EMAIL]/[PHONE]`), **driften
aber in der Feld-Abdeckung**:

| Feld | `convertResumeToText` (Routes) | `convertResumeForMatch` (Runner) |
|---|---|---|
| Name/Email/Phone | `[NAME]/[EMAIL]/[PHONE]` ✔ | `[NAME]/[EMAIL]/[PHONE]` ✔ |
| **Address** | `[ADDRESS]` (`preprocessing.ts:126`) | **gar nicht emittiert** (`runner.ts:817-824`) |
| Education-Block | enthalten + gescrubbt | separate Behandlung (nicht 1:1) |
| Freitext-Scrubber | `stripEmailPhonePatterns` | `stripEmailPhonePatterns` (**identisch**) |

→ **Kein aktiver Leak** (der Runner emittiert Address nicht). Aber die Asymmetrie
**beweist**, dass zwei handgepflegte Funktionen bereits auseinandergelaufen sind —
genau die Klasse, die letzte Session den Runner-Leak erzeugte. Fügt jemand der Route
ein Feld hinzu (z.B. `socialProfiles`, `links`), kennt der Runner es nicht.

---

## [ ] Scope-Entscheidung ZUERST (kurz abstimmen oder fundiert begründen)

Kandidaten (Herkunft markiert — Index-Einträge ggf. veraltet, prüfe IMMER gegen Code):

### 1) PII-Egress-Härtung-Sprint — Scope korrigiert ✅ [verifiziert 2026-05-29]

Kohärente Fortsetzung von GDPR S3. **Sauber abgegrenzter ~1-Tages-Konsolidierungssprint**
(kein verstecktes Volumen, kein vergessener Leak — aber niedriger User-sichtbarer Wert):

- **a. [REAL, ~½ Tag]** `convertResumeForMatch` (Runner) + `convertResumeToText` (Routes)
  vereinheitlichen. Beweis für die Notwendigkeit: **Address-Asymmetrie** (s. Egress-Inventur).
  Blocker: kleiner Typ-Unterschied (`ResumeWithSections` Prisma-Shape vs `Resume`
  profile.model). Beseitigt die Duplikat-Klasse, die den Runner-Leak verursacht hat.
- **b. [REAL, folgt aus a]** Den Scrubber (`stripEmailPhonePatterns`) aus
  `ai-provider/tools/text-processing.ts` in eine wirklich geteilte Lib heben (z.B.
  `src/lib/pii/`). Heute existieren **3 unabhängige Redaktions-Implementierungen**
  (2× Resume-Konverter + 1× Webhook-Allowlist), 0 geteilte Lib. Konvergenz = nachhaltige
  Egress-Invariante (Allowlist > Denylist als Zielbild).
- **c.** ~~Webhook-Payloads filtern~~ — ✅ **BEREITS ERLEDIGT** (IF-8). `filterWebhookData()`
  ist eine strikte Allowlist (`WEBHOOK_ALLOWED_DATA_FIELDS`, 19 PII-freie Felder),
  GDPR-Art.-5(1)(c)-begründet, in `__tests__/webhook-channel.spec.ts` getestet.
  **Der Index war hier veraltet.** → Aus dem Scope streichen.
- **d. [REAL, Doku/Compliance]** DSAR/RoPA/Privacy-Policy: KI-Provider (OpenAI/DeepSeek)
  als Drittempfänger von Resume-Text deklarieren. Durch a/b erst präzise formulierbar.

**Akzeptierte Residuen (dokumentiert, NICHT im Scope):** Unicode/IDN-Emails (ASCII-Regex),
Namen/Adressen in Freitext (NER unverhältnismäßig), Art.-9-Daten — identisch auf allen
3 AI-Pfaden. Allium ZUERST befragen (`security-rules.allium`, `ai-provider.allium`
`CloudTransferDataMinimization`) + DDD.

### 2) S2 UX Polish [vorbestehend] — größter User-sichtbarer Value

Prompt: `~/s2-ux-polish-session.md` (276 Zeilen, vorhanden). P0 (9 Findings) +
Twenty-Enhancements (7) + Add-Job-Dialog-Divergenzen (7). **Hinweis:** Findings vor
Start gegen Code verifizieren (P0-Liste könnte ebenfalls Index-Drift haben). UI-design-
Agenten zuerst konsultieren (`feedback_ui_design_agent`).

### 3) PII-at-rest [vorbestehend, GDPR-Audit 2026-05-12]

SEPARATER Storage/Krypto-Strang (Person-PII im Klartext → field-level encryption).
Bewusst NICHT in 1) gebündelt: andere Achse (Storage statt Egress), eigenes Risiko/Migration.

### 4) Architektur-Sprints (groß) [vorbestehend, 2026-04-10]

H-P-09 Observability (CRITICAL cross-cutting, Stack-Entscheidung nötig), M-A-09 undoStore
split-brain, getStagedVacancies Cursor-Pagination.

### Empfehlung (nachhaltigste Reihenfolge)

Ehrliche Gewichtung: **Nachhaltigkeit vs. User-sichtbarer Wert.**
- **Option 1** tilgt Wurzel-Schuld (Konverter-Duplikation + fragmentierte Redaktion),
  bevor eine vierte Senke/ein viertes Feld driftet — aber **kein User-sichtbarer Wert**,
  und durch erledigtes 1c nur noch ~1 Tag.
- **Option 2** liefert den größten Produktfortschritt, ist aber groß.

Vorschlag: **1a als ½-Tages-Aufwärmer** (entfernt die Leak-verursachende Duplikat-Klasse
an der Wurzel — Nachhaltigkeitsprinzip), **dann S2 UX Polish als Hauptsprint**. 1d (Docs)
kann mitlaufen. Bei reinem Fokus auf Produktwert: direkt S2.

---

## [ ] Entwicklung

`/full-stack-orchestration:full-stack-feature` (lean, wo chirurgisch — DB/Deploy-Phasen
ggf. N/A; keine unnötige Zeremonie). TDD durchgehend. Bei GDPR-Zweifeln zusätzlich
`/gdpr-data-handling`. Nach jedem Sprint: `/comprehensive-review:full-review` +
Blind-Spot/Flashlight-Analyse, alle Findings autonom fixen, jede Agent-„fixed"-Behauptung
gegen `git diff` verifizieren.

---

## [ ] Zwei aktive Nebenstränge unangetastet erhalten (siehe Handoff)

- **arbeitsagentur Keep-Alive v7** (signoutRedirect-Patch auf oidc UserManager)
- **Twenty CRM /understand-Analyse PAUSIERT** bei Wave 70 (350/568 Batches, 61.6%) —
  resume from batch 350.
