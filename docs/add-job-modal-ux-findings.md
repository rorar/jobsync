# Add Job Modal — UX/UI Findings

Aufgenommen: 2026-05-27 (Session Bug-Fix P2003)
Status: DOKUMENTIERT — nicht in dieser Session bearbeiten.
Verifiziert gegen Code: 2026-05-29 (HEAD c8e99df, via /understand-chat + Direkt-Check)

> **Verifikations-Ergebnis 2026-05-29:** Kein Finding vollständig erledigt.
> Zwei TEILWEISE durch zwischenzeitliche Sprints (GeoCode 1.21 / Holiday 1.22 / CRM):
> - **F-AJ-06 TEILWEISE:** `Person.addressCountryCode/addressSubdivisionCode/addressCity`
>   existieren, `CountrySelect`+`SubdivisionSelect` Components + `reference-data.actions`
>   OHS-Bridge geliefert, in `PersonForm` verdrahtet. OFFEN: (1) Währungsfeld fehlt
>   überall (GeoCode = ISO-3166 Land, NICHT ISO-4217 Währung), (2) Felder auf **Person**,
>   nicht auf **User-Profil** (Ziel war eigene Adresse), (3) Onboarding-Integration.
> - **F-AJ-07 TEILWEISE:** JobContact-Backend komplett (`addJobContact`/`removeJobContact`/
>   `getJobContactsForJob` + Events). OFFEN: UI in AddJob.
> - **F-AJ-05 Infra-Teilstück:** `src/lib/staging/format-salary-range.ts` Formatter +
>   `StagedVacancy.salaryMin/Max/Currency` existieren (wiederverwendbar). Job-Model noch
>   `salaryRange String?`, AddJob noch `SALARY_RANGES`-String.
> - Rest (01/02/03/04/08/09) unverändert OFFEN.

---

## F-AJ-01: Job-Titel Overflow (Layout)

**Problem:** Jobtitel ueberlappt bei langen Titeln (z.B. `Junior Adoption & Change-Management Consultant Modern Workplace (m/w/d)`).
**Fix:** Titel-Feld bekommt volle Container-Breite (`md:col-span-2`).
**Aufwand:** S (CSS-only)

---

## F-AJ-02: Applied Toggle + Status Dropdown Redundanz

**Problem:** Toggle "Applied" und Status-Dropdown "Applied" bilden die gleiche Funktion ab. Toggle aktiviert Date Applied + setzt Status. Dropdown kann ebenfalls "Applied" setzen.
**Entscheidung:** Toggle entfernen. Status-Dropdown steuert die Applied-Logik:
- Alle Status ausser `bookmarked` aktivieren das "Date Applied"-Feld
- Status-Dropdown wird ComboBox mit Suchfunktion (konsistent mit den anderen Feldern)
**Abhaengigkeit:** F-AJ-09 (Benutzerdefinierter Status) — bei Custom Status braucht `JobStatus`-Model eine `category`-Eigenschaft (`pre_application` | `post_application` | `terminal`) statt hardcoded Applied-Logik
**Aufwand:** M

---

## F-AJ-03: Status Dropdown ueber Date Applied (Layout)

**Problem:** Status-Dropdown ist aktuell unter Date Applied positioniert.
**Fix:** Status-Dropdown vor/ueber Date Applied platzieren (logische Reihenfolge: Status bestimmt ob Date Applied relevant ist).
**Aufwand:** S (Layout-Reihenfolge)

---

## F-AJ-04: Due Date — Optional + Zuruecksetzen

**Problem:** Due Date (Bewerbungsfrist) ist aktuell required mit Default `+3 Tage`. Nicht alle Stellen haben eine Frist. Feld laesst sich nicht zuruecksetzen.
**Fix:**
- Due Date optional machen (kein Default)
- "X"-Button zum Zuruecksetzen des Feldes (Clear-Action im DatePicker)
- Schema-Aenderung: `dueDate: z.date().optional()` (aktuell `z.date()` ohne `.optional()`)
**Aufwand:** S

---

## F-AJ-05: Salary — Custom Range + Fixum + Slider

**Problem:** Aktuell nur vorgefertigte Salary Ranges als Dropdown (`SALARY_RANGES` Array mit Strings wie "$50,000 - $70,000").
**Entscheidung:** Komplett ueberarbeiten:
- **Modus-Auswahl:** Range (Min/Max) oder Fixum (einzelner Wert)
- **Range-Slider:** Zwei Handles fuer Min/Max, numerische Eingabefelder daneben
- **Presets:** Vorgefertigte Ranges als Schnellauswahl ueberschreiben den Slider
- **Fixum:** Einzelnes Zahlenfeld (z.B. 75000)
- **Waehrung:** ComboBox mit Suchfunktion (ISO 4217 als Single Source of Truth)
  - Format: `EUR - Euro`, `USD - US Dollar`, `CHF - Schweizer Franken`
  - Suche akzeptiert Code, Symbol und ausgeschriebenen Namen
  - Lokalisierte Waehrungsnamen via `Intl.DisplayNames`
- **Periode:** Jahresgehalt / Monatsgehalt Toggle + automatische Umrechnung als Info
- **Waehrungsumrechnung:** Info-Anzeige mit Umrechnung in die Standardwaehrung des Benutzers (z.B. User lebt in DE, Stelle zahlt in USD)
**Datenmodell-Aenderung:** `salaryRange: String` -> `salaryMin: Float?`, `salaryMax: Float?`, `salaryCurrency: String?`, `salaryPeriod: String?` (Migration erforderlich, StagedVacancy hat bereits `salaryMin`/`salaryMax`/`salaryCurrency`/`salaryPeriod`)
**Cross-Ref:** F-AJ-06 (Benutzer-Profil Standardwaehrung)
**Aufwand:** L (Datenmodell + UI + Waehrungs-Integration)

---

## F-AJ-06: Benutzer-Profil Erweiterung — Adresse + Standardwaehrung

**Problem:** Kein Land/Adresse im Benutzerprofil. Standardwaehrung nicht konfigurierbar.
**Entscheidung:**
- **Profil erweitern um:**
  a) Eigene Adresse (vorallem Land) — fuer Nachvollziehbarkeit der Standardwaehrung + Lokalisierung
  b) Standardwaehrung auswaehlbar (Default: abgeleitet aus Land)
- **Onboarding Guide** (ROADMAP 2.3) sollte diese Felder im Onboarding abfragen
- **ROADMAP aktualisieren:** 2.3 Onboarding um Adresse + Waehrung erweitern
**Cross-Ref:** F-AJ-05 (Salary), ROADMAP 2.3 (Onboarding Guide)
**Aufwand:** M (Profil-Erweiterung + Settings UI + Onboarding-Integration)

---

## F-AJ-07: CRM-Verbindung — Person + Unternehmen im Add Job

**Problem:** Keine Moeglichkeit, beim Erstellen eines Jobs direkt eine Kontaktperson (HR/Recruiter) oder CRM-Verknuepfung anzulegen.
**Entscheidung:** Optionales "Kontaktperson hinzufuegen" im Add Job Modal:
- ComboBox: Existierende Personen auswaehlen oder neue Person erstellen
- Rolle auswaehlbar (HR, Recruiter, Hiring Manager, etc.)
- Nutzt existierendes `JobContact`-Model (N:M Person <-> Job mit `role`)
**Cross-Ref:** S2-UX-Polish Prompt (Add Job Contact Person -> Job Detail view), ROADMAP 5.4 (CRM Core)
**Aufwand:** M

---

## F-AJ-08: Recruiter/Headhunter Dreiecksmodell

**Problem:** Fehlende Moeglichkeit, einen Recruiter/Headhunter (eigene Firma) anzugeben, der fuer ein anderes Unternehmen (Zielunternehmen) vermittelt. Der Kreis der Ansprechpartner erweitert sich ueber die Zeit.

**Szenario:**
```
Person (Recruiter) -> arbeitet bei -> Company (Headhunter-Firma)
         | vermittelt fuer
    Company (Zielunternehmen)
         | hat eigene
    Person (HR des Zielunternehmens)
```

**Entscheidung:** Volles Dreiecksmodell (Option C — nachhaltigste):
- `JobContact` bekommt `relationshipType`: `direct_hire` | `via_recruiter` | `via_agency`
- Job bekommt optionale `recruitingCompanyId` (die Agentur) neben `companyId` (Zielunternehmen)
- Person hat bereits `CompanyAssociation` (CRM-Model) — wird wiederverwendet
- UI zeigt die Vermittlungskette: Recruiter (Firma X) -> vermittelt bei -> Zielunternehmen
- Interaktion: Verbindung aktivieren/deaktivieren ueber Toggle oder Relationship-Type-Dropdown auf dem JobContact

**Datenmodell-Aenderung:**
- `Job.recruitingCompanyId: String?` (FK zu Company, optional)
- `JobContact.relationshipType: String` (enum: direct_hire, via_recruiter, via_agency)
**Cross-Ref:** F-AJ-07 (CRM-Verbindung), ROADMAP 5.4/5.5 (CRM Core)
**Aufwand:** L (Datenmodell + UI + CRM-Integration)

---

## F-AJ-09: Benutzerdefinierter Status (Custom Job Status)

**Problem:** Aktuell sind Job-Status fest geseeded (Bookmarked, Applied, Interview, Offer, Accepted, Rejected, Expired, Archived). Benutzer koennen keine eigenen Status erstellen (z.B. "1. Gespraech", "2. Gespraech", "Gehaltsverhandlungen").
**Entscheidung:** Benutzer koennen eigene Status erstellen:
- `JobStatus` wird user-spezifisch (aktuell global geseeded)
- `JobStatus.category`: `pre_application` | `post_application` | `terminal` — steuert Applied-Logik und Kanban-Verhalten
- `JobStatus.sortOrder`: Reihenfolge im Kanban Board + Dropdown
- `JobStatus.color`: Farbzuweisung fuer Kanban-Spalten
- State-Machine-Transitions werden user-konfigurierbar (aktuell hardcoded in `validate-edit-transition.ts`)
- Kanban-Spalten werden dynamisch basierend auf den User-Status

**Auswirkungen:**
- Kanban Board: Dynamische Spalten statt fester 8-Spalten-Layout
- Status-History: Funktioniert bereits mit FK, keine Aenderung noetig
- Notifications: `JobStatusChanged` Event nutzt bereits `statusValue`, braucht Anpassung fuer Custom-Werte
- Automations: Status-basierte Trigger muessen Custom-Status unterstuetzen
- API v1: Status-Endpoints muessen Custom-Status zurueckgeben

**Cross-Ref:** F-AJ-02 (Applied-Logik via Category), ROADMAP 2.x (UX/UI)
**Aufwand:** XL (Datenmodell + State Machine + Kanban + Settings UI + Migration)

---

## Zusammenfassung

| ID | Thema | Aufwand | Status (2026-05-29) | Abhaengigkeiten / Wiederverwendbare Infra |
|----|-------|---------|---------------------|-------------------------------------------|
| F-AJ-01 | Titel volle Breite | S | OFFEN | — |
| F-AJ-02 | Applied Toggle entfernen, Status ComboBox | M | OFFEN | F-AJ-09 |
| F-AJ-03 | Status ueber Date Applied | S | OFFEN | — |
| F-AJ-04 | Due Date optional + Reset | S | OFFEN | `addJobForm.schema.ts:52` noch `z.date()` |
| F-AJ-05 | Salary Slider + Fixum + Waehrung | L | OFFEN (Infra teilw.) | `format-salary-range.ts` + `StagedVacancy.salaryMin/Max/Currency` wiederverwendbar; Job-Model migrieren |
| F-AJ-06 | Profil: Adresse + Standardwaehrung | M | TEILWEISE | `CountrySelect`/`SubdivisionSelect`/`reference-data.actions` da (PersonForm); offen: Waehrung, User-Profil-Form, Onboarding |
| F-AJ-07 | CRM Person im Add Job | M | TEILWEISE | JobContact-Backend fertig; offen: AddJob-UI |
| F-AJ-08 | Recruiter Dreiecksmodell | L | OFFEN | F-AJ-07; kein `recruitingCompanyId`/`relationshipType` |
| F-AJ-09 | Benutzerdefinierter Status | XL | OFFEN | — |

**Empfohlene Reihenfolge:** F-AJ-01/03/04 (Quick Wins) -> F-AJ-02 -> F-AJ-06 -> F-AJ-05 -> F-AJ-07 -> F-AJ-08 -> F-AJ-09

## Verbindungs-Punkte zu gelieferter Infra (2026-05-29)

1. **F-AJ-06 ← CountrySelect/SubdivisionSelect/reference-data.actions (GeoCode 1.21):**
   In **User-Profil/Settings** einbauen (eigene Adresse). AddJob-Location-Feld kann
   CountrySelect wiederverwenden. Waehrung braucht NEUE ISO-4217-Quelle + Land→Waehrung-Map
   fuer Default (GeoCode liefert nur Land).
2. **F-AJ-05 ← format-salary-range.ts (staging):** Job-Model `salaryRange String` →
   `salaryMin/Max/Currency/Period` migrieren (Angleich an StagedVacancy), Formatter
   wiederverwenden, Slider-UI bauen.
3. **F-AJ-07 ← JobContact actions + Events:** ComboBox in AddJob, nach Job-Create
   `addJobContact()`. Danach F-AJ-08 (Dreieck) aufsetzen.
4. **Holiday 1.22:** NICHT F-AJ-Scope (treibt CRM HolidayBadge).
