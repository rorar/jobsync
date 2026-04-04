# CareerBERT Modellvergleich — Einfach erklärt

> Datum: 2026-04-01
> Kontext: Welche Embedding-Modelle kommen für JobSync in Frage und würden sie CareerBERT (jobGBERT) ausstechen?

---

## Das Grundproblem: Allgemein-Wissen vs. Spezial-Wissen

Stell dir vor, du suchst einen Übersetzer:

- **CareerBERT** = Ein Übersetzer, der nur Deutsch kann, aber 10 Jahre in einer HR-Abteilung gearbeitet hat. Er kennt jede Jobbezeichnung, jeden ESCO-Code, jeden Skill-Begriff.
- **ModernBERT / Nomic / BGE** = Ein Übersetzer, der 100 Sprachen kann, an den besten Unis studiert hat, aber noch nie in einer HR-Abteilung war.

Wer ist besser? **Kommt auf die Aufgabe an.**

---

## Die Kandidaten in einfachen Worten

### 1. all-MiniLM-L6-v2 — "Der Winzling"
- **Was:** Winziges Modell (22.7M Parameter, 14 MB komprimiert)
- **Kann:** Texte vergleichen und ähnliche finden
- **Stärke:** Läuft auf *allem* — Raspberry Pi, alter Laptop, 2 GB VPS
- **Schwäche:** Nur Englisch, kurzes Kontextfenster (512 Tokens), niedrigster MTEB-Score (56.3)
- **Schlägt es CareerBERT?** Nein. Zu klein, kein Deutsch, kein Job-Wissen.
- **Wofür gut:** MVP/Prototyp, um zu testen ob die Pipeline überhaupt funktioniert

### 2. ModernBERT-embed-base — "Der Nachfolger"
- **Was:** BERT-Nachfolger von 2025 (Nomic AI + Answer.AI), ~150M Parameter
- **Kann:** Alles was BERT kann, aber besser. Matryoshka-Support (768→256 Dims)
- **Stärke:** MTEB 62.6 (deutlich besser als BERT-base), 8192 Tokens Kontext, Apache 2.0
- **Schwäche:** Nur Englisch, kein Job-Domain-Wissen
- **Schlägt es CareerBERT?** *Auf allgemeinen Benchmarks ja. Auf ESCO-Job-Matching: wahrscheinlich nicht ohne Fine-Tuning.* Aber als Basis für eigenes Fine-Tuning wäre es stärker als jobGBERT.

### 3. nomic-embed-text-v1.5 — "Der Flexible"
- **Was:** 137M Parameter, Matryoshka bis runter auf 64 Dimensionen
- **Kann:** Embeddings in variabler Größe — grob suchen bei 64 Dims, präzise bei 768
- **Stärke:** MTEB 62.3, 8192 Tokens, Apache 2.0, vollständig offen (Gewichte + Code + Trainingsdaten)
- **Schwäche:** Primär Englisch
- **Schlägt es CareerBERT?** Gleiche Situation wie ModernBERT. Allgemein besser, auf Job-Matching ohne Fine-Tuning wahrscheinlich nicht.

### 4. BGE-small-en-v1.5 — "Der Kompakte"
- **Was:** 33.4M Parameter, 384 Dimensionen
- **Kann:** Erstaunlich gute Embeddings für seine Größe
- **Stärke:** MTEB 62.2 — fast so gut wie die 4x größeren Modelle! Nur 34 MB INT8
- **Schwäche:** Nur Englisch, 512 Tokens
- **Schlägt es CareerBERT?** Auf allgemeinen Tasks ja (MTEB 62.2 vs. CareerBERT ~56-58 geschätzt). Auf ESCO-Matching ohne Fine-Tuning: unklar.

### 5. multilingual-e5-small — "Der Europäer"
- **Was:** 118M Parameter, 100+ Sprachen inklusive Deutsch, Französisch, Spanisch
- **Kann:** Texte *sprachübergreifend* vergleichen (DE CV ↔ FR Jobanzeige)
- **Stärke:** JobSync hat 4 Locales (DE/FR/ES/EN) — dieses Modell deckt alle ab
- **Schwäche:** Etwas schwächer als englisch-only Modelle
- **Schlägt es CareerBERT?** Auf Deutsch allein: wahrscheinlich nicht. Aber es kann etwas, das CareerBERT *gar nicht kann*: Cross-Language Matching.

### 6. BGE-M3 — "Das Schweizer Taschenmesser"
- **Was:** 568M Parameter, 100+ Sprachen, Dense + Sparse + Multi-Vector in einem Modell
- **Kann:** Gleichzeitig semantische UND Keyword-Suche (Hybrid Search)
- **Stärke:** MTEB 63.0, bestes multilinguales Open-Source Modell
- **Schwäche:** Braucht ~2.2 GB RAM (FP32), ~568 MB (INT8) — kein Raspberry Pi mehr
- **Schlägt es CareerBERT?** Auf allgemeinen Benchmarks klar ja. Auf ESCO-Matching: *möglich*, weil es einfach so viel mehr Sprach-Wissen hat. Aber ohne Fine-Tuning nicht garantiert.

---

## Die ehrliche Antwort: Schlägt eines davon CareerBERT?

### Auf dem spezifischen ESCO-Job-Matching-Task: **Wahrscheinlich nicht ohne Fine-Tuning.**

Warum? CareerBERT hat zwei entscheidende Vorteile:

1. **Domain Adaptive Pre-Training (DAPT):** jobGBERT wurde auf 4 Millionen deutschen Jobanzeigen vortrainiert. Es *denkt* in Job-Sprache.
2. **Task-spezifisches Fine-Tuning:** 131.000 ESCO-Satzpaare mit MNR-Loss. Es weiß, dass "Krankenpfleger" und "Gesundheits- und Krankenpfleger" das gleiche bedeuten.

Ein allgemeines Modell — egal wie gut es auf MTEB scored — hat dieses Spezialwissen nicht.

### ABER: Mit Fine-Tuning auf denselben ESCO-Daten würde ein modernes Modell CareerBERT wahrscheinlich übertreffen.

Warum?
- ModernBERT hat eine **effizientere Architektur** als das originale BERT von 2018
- Modernere Trainingsmethoden (Rotary Embeddings, Flash Attention)
- **8192 Tokens** statt 512 → kann längere CVs und Jobbeschreibungen verarbeiten
- Matryoshka-Support für variable Suchpräzision

### Analogie:
> CareerBERT = Erfahrener HR-Sachbearbeiter mit Gymnasialabschluss
> ModernBERT (untrainiert) = Uni-Absolvent ohne Berufserfahrung
> ModernBERT (fine-tuned auf ESCO) = Uni-Absolvent MIT Berufserfahrung → **wahrscheinlich besser**

---

## Empfehlung für JobSync

| Phase | Was tun | Warum |
|-------|---------|-------|
| **Jetzt** | CareerBERT-JG verwenden wie geplant | Es ist *das einzige* Modell das speziell für ESCO-Matching trainiert wurde |
| **Parallel** | Prototyp mit ModernBERT-embed-base bauen | Testen ob es auf ESCO *ohne* Fine-Tuning brauchbar ist |
| **Wenn ESCO-Pipeline steht** | ModernBERT auf eigene ESCO-Daten fine-tunen | Wird CareerBERT wahrscheinlich übertreffen |
| **Für multilingual** | multilingual-e5-small evaluieren | CareerBERT kann kein Französisch/Spanisch |

---

## Warum MTEB-Scores irreführend sind

Die MTEB-Scores sind irreführend für diesen Vergleich. MTEB misst allgemeine Embedding-Qualität über diverse Tasks. CareerBERT scored dort wahrscheinlich ~56-58 (niedriger als BGE-small mit 62.2). Aber auf dem *spezifischen* Task "Deutsche Resumes → ESCO Jobs" schlägt es sogar OpenAI's text-embedding-3-small. **Domain-Wissen > allgemeine Intelligenz**, zumindest bis jemand ein modernes Modell auf denselben Daten fine-tuned.

---

## Woran wir nicht gedacht haben — Blinde Flecken

### 1. DSGVO / Datenschutz bei CV-Embeddings

Das ist der **größte blinde Fleck**. Embeddings von Lebensläufen sind personenbezogene Daten. Aktuelle Forschung zeigt, dass Embeddings teilweise **rückwärts in Originaltext umgewandelt werden können** (Embedding Inversion Attacks). Das heißt:

- Wo werden die CV-Embeddings gespeichert? In SQLite? Verschlüsselt?
- Kann ein Angreifer mit Datenbankzugang den Lebenslauf rekonstruieren?
- Muss der User explizit einwilligen, dass sein CV als Vektor gespeichert wird?
- **Recht auf Löschung:** Wenn ein User sein Konto löscht, müssen auch seine Embeddings gelöscht werden
- Self-hosted mildert das Problem, aber nicht komplett

### 2. Embedding-Versionierung

Wenn du das Modell wechselst (z.B. von MiniLM auf ModernBERT), sind **alle gespeicherten Embeddings wertlos**. Die Vektoren verschiedener Modelle leben in verschiedenen Räumen — du kannst sie nicht mischen.

Das heißt:
- Bei jedem Modellwechsel: alle 3.008 ESCO-Centroids + alle User-CV-Embeddings neu berechnen
- Braucht eine `embedding_model_version` Spalte in der Datenbank
- Migrations-Strategie: alte und neue Embeddings parallel halten während der Umstellung?

### 3. Deutsche Compound-Words / Tokenizer-Problem

Deutsche Jobtitel wie "Softwareentwicklungsingenieur" oder "Krankenpflegefachassistenz" werden von nicht-deutschen Tokenizern **zerstückelt** in sinnlose Sub-Tokens. CareerBERT (jobGBERT) hat einen deutschen Tokenizer der damit umgehen kann. Ein englisches Modell wie ModernBERT oder BGE-small? Keine Chance.

Das relativiert den Rat "modernere Modelle sind besser" — **für Deutsch braucht man einen deutschen oder multilingualen Tokenizer**.

**Einschränkung der Modellauswahl:**

| Modell | Deutscher Tokenizer? | Geeignet für DE? |
|--------|---------------------|-----------------|
| CareerBERT (jobGBERT) | Ja (GBERT) | **Ja** |
| ModernBERT-embed-base | Nein (EN) | **Nein** für DE |
| BGE-small-en-v1.5 | Nein (EN) | **Nein** für DE |
| nomic-embed-text-v1.5 | Nein (EN) | **Nein** für DE |
| all-MiniLM-L6-v2 | Nein (EN) | **Nein** für DE |
| multilingual-e5-small | Ja (XLM-R) | **Ja** |
| BGE-M3 | Ja (XLM-R) | **Ja** |
| paraphrase-multilingual-MiniLM | Ja (XLM-R) | **Ja** |

→ Für deutschen Job-Markt kommen nur 4 von 8 Modellen in Frage!

### 4. Feedback-Loop fehlt

Wir haben nur über die *erste* Empfehlung gesprochen, aber:
- Woher weiß das System ob ein Match **gut** war?
- Wenn User "Job X passt nicht" sagen → wie fließt das zurück?
- Ohne Feedback-Loop wird das Matching nie besser als Tag 1
- Braucht: Thumbs-up/down auf Matches → Datensatz für Re-Training

### 5. ESCO-Taxonomie ist nicht statisch

ESCO wird von der EU regelmäßig aktualisiert (neue Berufe, umbenannte Kategorien).
- Wer triggert die Neuberechnung der Centroids?
- Wie erkennt JobSync, dass sich ESCO geändert hat?
- Passt in den bestehenden Cache-TTL-Mechanismus? (Roadmap 0.9 hat ESCO TTL bei 24h — aber Centroids brauchen Wochen-/Monats-TTL)

### 6. Latenz-Budget nicht definiert

Wir wissen wie lange ein Embedding dauert (12-25ms), aber nicht:
- Was ist das **akzeptable End-to-End-Budget**? CV hochladen → Matches sehen?
- Passiert Matching **bei Upload** (batch, im Hintergrund) oder **bei Suche** (real-time)?
- Bei batch: RunCoordinator nutzen? Eigener Background-Job?
- Bei real-time: 12ms Embedding + <1ms Search = ~15ms → kein Problem. Aber mit LLM-Anreicherung für kurze CVs? Plötzlich Sekunden.

### 7. Hybrid-Ansatz: CareerBERT + General Model

Wir haben es als Entweder-Oder betrachtet. Aber:
- **CareerBERT für Deutsch** (wo es stark ist)
- **multilingual-e5-small für FR/ES/EN** (wo CareerBERT gar nicht kann)
- Gewichtetes Ensemble beider Scores?
- Oder: CareerBERT als "Spezialist" für ESCO-Klassifikation, General-Model für "ähnliche Jobs finden"

### 8. Explainability für den User

Wir haben "Explainability-Layer nötig" in die Roadmap geschrieben, aber nicht *wie*:
- "Dieses Modell empfiehlt dir Job X" — **warum?**
- Welche Skills haben gematcht? Welche fehlen?
- Das ist kein Nice-to-have — ohne Erklärung vertrauen User den Empfehlungen nicht
- Möglicher Ansatz: Cross-Encoder Re-Ranker der Attention-Weights extrahiert

### 9. Offline-Fähigkeit

JobSync ist self-hosted. Was passiert wenn:
- Das Embedding-Modell noch nicht heruntergeladen ist? (Erster Start)
- Kein Internet verfügbar ist? (Modell-Download braucht HuggingFace-Zugang)
- → Modell muss im Docker-Image gebündelt oder beim ersten Start gecached werden

### 10. Kein A/B-Testing-Plan

Wir haben 4 Phasen definiert, aber wie vergleichen wir die Modelle in der Praxis?
- Braucht: Gleiche CVs durch verschiedene Modelle schicken, Ergebnisse vergleichen
- HR-Expert-Evaluation (wie im CareerBERT-Paper) ist teuer (10 Experten × 143 Empfehlungen)
- Automatische Evaluation: eigene Testdaten aus JobSync-Nutzung aufbauen

---

## Korrigierte Empfehlung

Angesichts des Tokenizer-Problems ändert sich die Empfehlung:

| Phase | Vorher | Korrigiert |
|-------|--------|-----------|
| **Phase 1** | all-MiniLM-L6-v2 | **CareerBERT-JG direkt** (hat deutschen Tokenizer + ESCO-Wissen) |
| **Phase 2** | ModernBERT-embed-base | **multilingual-e5-small** (hat multilingualen Tokenizer, fine-tunebar) |
| **Phase 3** | multilingual-e5-small | **BGE-M3** (Hybrid Search, 100+ Sprachen, Deutsch-stark) |
| **Phase 4** | Fine-Tuning | **multilingual-e5-small fine-tuned auf ESCO** (bester Kompromiss Größe/Qualität/Sprachen) |
