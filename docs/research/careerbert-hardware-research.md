# CareerBERT Hardware & Integration Research

> Research-Datum: 2026-04-01
> Kontext: Evaluierung von Embedding-Modellen für semantisches Job-Matching auf leistungsschwacher Hardware (Self-Hosted, CPU-only, 4-8 GB RAM)

---

## 1. Embedding-Modelle: Vergleich für Low-Power Hardware

### 1.1 Kleine Modelle (< 150M Parameter)

| Modell | Params | Dims | Max Tokens | MTEB Avg | Retrieval | STS | RAM (FP32) | RAM (INT8) | Lizenz |
|--------|--------|------|------------|----------|-----------|-----|-----------|-----------|--------|
| **all-MiniLM-L6-v2** | 22.7M | 384 | 512 | 56.3 | ~46 | ~78 | ~91 MB | ~23 MB | Apache 2.0 |
| **BGE-small-en-v1.5** | 33.4M | 384 | 512 | 62.17 | 51.68 | 81.59 | ~134 MB | ~34 MB | MIT |
| **GTE-small** | 33.4M | 384 | 512 | ~61 | ~49 | ~80 | ~70 MB | ~34 MB | MIT |
| **ModernBERT-embed-base** | ~150M | 768 (256 Matryoshka) | 8192 | **62.62** | 52.89 | 81.78 | ~600 MB | ~150 MB | Apache 2.0 |
| **nomic-embed-text-v1.5** | 137M | 768 (64 Matryoshka) | 8192 | 62.28 | 53.01 | 81.94 | ~550 MB | ~137 MB | Apache 2.0 |

### 1.2 Mittlere Modelle (150M-600M)

| Modell | Params | Dims | Max Tokens | MTEB Avg | Sprachen | RAM (FP32) | Lizenz |
|--------|--------|------|------------|----------|----------|-----------|--------|
| **mxbai-embed-large-v1** | 335M | 1024 | 512 | ~64 | EN | ~1.3 GB | Apache 2.0 |
| **stella_en_400M_v5** | 400M | 1024 | 8192 | ~66 | EN | ~1.6 GB | MIT |
| **BGE-M3** | 568M | 1024 | 8192 | 63.0 | **100+** | ~2.2 GB | MIT |
| **jina-embeddings-v3** | 570M | 1024 (32 Matryoshka) | 8192 | ~62 | **89+** | ~2.3 GB | CC-BY-NC |

### 1.3 Multilingual-Modelle (relevant für DE/FR/ES/EN)

| Modell | Params | Dims | Sprachen | Deutsch-Support | RAM (FP32) |
|--------|--------|------|----------|-----------------|-----------|
| **paraphrase-multilingual-MiniLM-L12-v2** | 118M | 384 | 50+ | Ja | ~470 MB |
| **multilingual-e5-small** | 118M | 384 | 100+ | Ja | ~470 MB |
| **multilingual-e5-base** | 278M | 768 | 100+ | Ja | ~1.1 GB |
| **BGE-M3** | 568M | 1024 | 100+ | **Ja (stark)** | ~2.2 GB |
| **jina-embeddings-v3** | 570M | 1024 | 89+ | Ja | ~2.3 GB |

### 1.4 Job-Domain-spezifische Modelle

| Modell | Basis | Params | Sprache | MRR@100 | Trainigsdaten |
|--------|-------|--------|---------|---------|---------------|
| **CareerBERT-JG** | jobGBERT | ~110M | DE | 0.328 | 131K ESCO Pairs |
| **CareerBERT-G** | GBERT | ~110M | DE | 0.312 | 131K ESCO Pairs |
| **ESCOXLM-R** | XLM-R Large | ~560M | 27 Sprachen | 0.312 | ESCO Taxonomie |
| **conSultantBERT** | BERT | ~110M | ? | 0.132 | Recruiter Job-Resume Pairs |
| **jobGBERT** | GBERT | ~110M | DE | — | 4M DE Job-Anzeigen (DAPT) |

### 1.5 Matryoshka Embeddings — Qualitätsverlust bei reduzierten Dimensionen

| Dims | % der vollen Größe | Qualitätserhalt (Matryoshka-trainiert) | Qualitätserhalt (Standard) |
|------|-------------------|---------------------------------------|---------------------------|
| 768 | 100% | 100% | 100% |
| 256 | 33% | ~98.5% | ~97% |
| 128 | 17% | ~98% | ~96% |
| 64 | 8.3% | **98.37%** | 96.46% |

**Fazit:** Matryoshka-trainierte Modelle behalten bei 64 Dims (8.3% Speicher) noch 98.37% der Performance. Für Vorfilterung ideal.

---

## 2. ONNX Runtime & Quantisierung auf CPU

### 2.1 ONNX-Speedup vs. PyTorch

| Szenario | Speedup |
|----------|---------|
| ONNX auf GPU (kurze Texte) | 1.46x |
| ONNX-O4 auf GPU (kurze Texte) | 1.83x |
| **ONNX INT8 auf CPU (kurze Texte)** | **3.08x** |
| ONNX INT8 auf CPU (allgemein) | 2.09x |

### 2.2 Konkrete CPU-Benchmarks

#### all-MiniLM-L6-v2 (22.7M Params) — Intel CPU, 128 Tokens

| Variante | Dateigröße | P95 Latenz | Avg Latenz | Pearson (STS) |
|----------|-----------|-----------|-----------|---------------|
| FP32 (Vanilla) | 86.66 MB | 25.64 ms | 19.75 ms | 0.8696 |
| **INT8 (Quantisiert)** | **63.47 MB** | **12.29 ms** | **11.76 ms** | **0.8663** |

→ **2.09x Speedup, 26.8% kleiner, ~100% Accuracy**

#### BGE-Modelle — Intel Xeon, INT8 Quantisierung

| Modell | INT8 Latenz | Speedup vs BF16 | Reranking-Verlust | Retrieval-Verlust |
|--------|------------|-----------------|-------------------|-------------------|
| BGE-small (45M) | <10 ms | bis 4.5x | -0.17% | -0.58% |
| BGE-base (110M) | <10 ms | bis 4.5x | 0% | -1.55% |
| BGE-large (355M) | <20 ms | bis 4.5x | -0.3% | -1.53% |

→ **INT8 Quantisierung: < 1% Genauigkeitsverlust bei 4.5x Speedup**

### 2.3 bert.cpp — 4-Bit Quantisierung

| Modell | Format | Dateigröße | STSBenchmark | RAM pro Token |
|--------|--------|-----------|-------------|--------------|
| all-MiniLM-L6-v2 | FP16 | ~43 MB | 0.8201 | 450 KB |
| all-MiniLM-L6-v2 | **Q4_0** | **14 MB** | **0.8175** | ~200 KB |
| all-MiniLM-L12-v2 | Q4_0 | ~28 MB | 0.8310 | ~350 KB |

→ **14 MB Modell mit <1% Qualitätsverlust. Läuft auf jedem Gerät.**

### 2.4 CPU-Embedding-Benchmarks nach Modellgröße

| Modell | Params | Embedding Time/1K Tokens | Query Latenz | Top-5 Accuracy |
|--------|--------|-------------------------|-------------|----------------|
| MiniLM-L6-v2 | 22.7M | 14.7 ms | 68 ms | 78.1% |
| E5-Base-v2 | 110M | 20.2 ms | 79 ms | 83.5% |
| BGE-Base-v1.5 | 110M | 22.5 ms | 82 ms | 84.7% |
| Nomic Embed v1 | ~500M | 41.9 ms | 110 ms | 86.2% |

### 2.5 Runtimes im Vergleich

| Runtime | Plattform | Quantisierung | Besonderheit |
|---------|-----------|---------------|-------------|
| **ONNX Runtime** | CPU/GPU/WASM | INT8/INT4 | Standard, breiteste Unterstützung |
| **OpenVINO** | Intel CPU | INT8/INT4 | Bis 4.5x Speedup auf Intel |
| **bert.cpp** | CPU | Q4_0/Q4_1/FP16 | 14 MB Modelle, C/C++, minimal |
| **CoreML** | Apple Silicon | Mixed | Optimal für M1/M2/M3 |
| **candle** | Rust/WASM | FP16/BF16 | Von HuggingFace, Rust-native |

---

## 3. Vektor-Suche auf Low-Power Hardware

### 3.1 Performance-Vergleich (1M Vektoren, k=20)

#### SIFT1M (128 Dims)

| Tool | Build Time | Query Latenz | Anmerkung |
|------|-----------|-------------|-----------|
| **FAISS (Flat)** | 126 ms | **10 ms** | Brute-force, schnellste Queries |
| sqlite-vec (Static) | 1 ms | 17 ms | Kein Index nötig |
| sqlite-vec (IVF 8192/2048) | 4,589 ms | 33 ms | Mit Index |
| DuckDB | 741 ms | 46 ms | SQL-basiert |

#### GIST1M (960 Dims — näher an BERT 768)

| Tool | Build Time | Query Latenz |
|------|-----------|-------------|
| sqlite-vec (Static) | 1 ms | **41 ms** |
| FAISS | 12,793 ms | 50 ms |
| sqlite-vec (IVF) | 15,502 ms | 87 ms |

### 3.2 Qdrant Speicherbedarf (1M Vektoren × 100 Dims)

| Modus | RAM | Performance |
|-------|-----|-------------|
| In-Memory | ~1.2 GB | ~780 req/s |
| Vectors MMAP | 600 MB | Abhängig von Disk-IOPS |
| Vectors + HNSW MMAP | **135 MB** | ~0.33 req/s (Disk-bound) |

### 3.3 sqlite-vec — Perfekt für JobSync (bereits SQLite/Prisma!)

- **Installation:** `npm install sqlite-vec`
- **Pure C**, keine Abhängigkeiten, läuft überall
- **Vektor-Typen:** float32, int8, binary
- **Performance bei 3K Vektoren:** < 1ms (trivial)
- **Performance bei 1M Vektoren:** ~17-41ms (brute-force, ausreichend)
- **Integration:** Raw SQL via Prisma `$queryRaw`

```sql
-- Tabelle erstellen
CREATE VIRTUAL TABLE job_embeddings USING vec0(
  embedding float[768]
);

-- Ähnlichkeitssuche
SELECT rowid, distance
FROM job_embeddings
WHERE embedding MATCH ?  -- Resume-Embedding
ORDER BY distance
LIMIT 20;
```

### 3.4 Empfehlung nach Skalierungsstufe

| Vektoren | Lösung | Zusätzliche Abhängigkeit | Latenz |
|----------|--------|------------------------|--------|
| < 10K | **Brute-Force in-memory** | Keine | < 1ms |
| 10K - 100K | **sqlite-vec** | npm Paket | < 5ms |
| 100K - 1M | **sqlite-vec + IVF** oder **FAISS** | npm/Python | 10-40ms |
| > 1M | **Qdrant** oder **FAISS + HNSW** | Docker/Python | 1-10ms |

---

## 4. Node.js / Next.js Integration

### 4.1 Transformers.js v4 (empfohlen)

- **npm:** `npm install @huggingface/transformers`
- **Nutzt ONNX Runtime** unter der Haube (onnxruntime-node auf Server)
- **WebGPU-Support** in v4 (Node.js, Bun, Deno)
- **~4x Speedup** für BERT mit MultiHeadAttention Operator
- **Singleton-Pattern** offiziell empfohlen von HuggingFace:

```typescript
// src/lib/embedding/pipeline.ts
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

class EmbeddingPipeline {
  static instance: FeatureExtractionPipeline | null = null;

  static async getInstance(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      this.instance = await pipeline('feature-extraction',
        'Xenova/all-MiniLM-L6-v2', // oder modernbert-embed-base
        { quantized: true }  // INT8 automatisch
      );
    }
    return this.instance;
  }
}
```

- **Build-Time:** 200ms (10x schneller als v3)
- **Bundle-Size:** 53% kleiner als v3
- Funktioniert in **Next.js API Routes** und **Server Actions**

### 4.2 fastembed-js (Alternative)

- **npm:** `npm install fastembed`
- Von Qdrant, nutzt ONNX Runtime
- Standardmodell: BGE-Base-EN (Flag Embedding)
- Kein GPU nötig, serverless-fähig
- Version 2.1.0 (Dez 2025)

```typescript
import { EmbeddingModel, FlagEmbedding } from "fastembed";

const model = await FlagEmbedding.init({
  model: EmbeddingModel.BGEBaseEN
});
const embeddings = model.embed(["Resume text here"]);
```

### 4.3 Python Sidecar (für fortgeschrittene Modelle)

Für Modelle die nur in Python verfügbar sind (z.B. CareerBERT original):

```yaml
# docker-compose.yml Ergänzung
services:
  embedding-server:
    image: python:3.12-slim
    command: uvicorn embedding_api:app --host 0.0.0.0 --port 8001
    volumes:
      - ./models:/models
    mem_limit: 512m  # Für INT8 MiniLM reichen 256MB
```

Kommunikation via HTTP oder Unix Socket.

### 4.4 sqlite-vec + Prisma Integration

```typescript
// Embeddings in SQLite speichern
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database('jobsync.db');
sqliteVec.load(db);

// Via Prisma Raw Query
const results = await prisma.$queryRaw`
  SELECT rowid, distance
  FROM job_embeddings
  WHERE embedding MATCH ${resumeEmbeddingBuffer}
  ORDER BY distance
  LIMIT 20
`;
```

---

## 5. Empfehlung für JobSync

### Phase 1: CareerBERT-JG direkt (sofort einsetzbar)

| Aspekt | Empfehlung |
|--------|-----------|
| **Modell** | CareerBERT-JG (jobGBERT-Basis, 110M Params) |
| **Dateigröße** | ~440 MB (FP32), ~110 MB (INT8) |
| **RAM** | ~110 MB (INT8) |
| **Latenz** | ~20 ms pro Embedding |
| **Integration** | Python Sidecar (sentence-transformers) oder ONNX-Export + Transformers.js |
| **Vektor-Suche** | Brute-Force in-memory (3K Centroids = < 1ms) |
| **Qualität** | MRR@100 0.328 auf ESCO — bestes verfügbares Modell für diesen Task |
| **Warum direkt:** | Einziges Modell mit deutschem Tokenizer + ESCO Fine-Tuning. EN-only Modelle (MiniLM, ModernBERT, BGE-small) scheitern an deutschen Compound-Words |

### Phase 2: Multilingual (DE/FR/ES/EN)

| Aspekt | Empfehlung |
|--------|-----------|
| **Modell** | multilingual-e5-small (118M, XLM-R Tokenizer) |
| **Dateigröße** | ~470 MB (FP32), ~120 MB (INT8) |
| **RAM** | ~120 MB (INT8) |
| **Latenz** | ~25 ms pro Embedding |
| **Vektor-Suche** | sqlite-vec (bereits SQLite-Stack) |
| **Cross-Language** | CV auf Deutsch → Jobs auf Französisch matchen |
| **Warum:** | Multilingualer Tokenizer der Deutsch korrekt handhabt. Ermöglicht alle 4 JobSync-Locales |

### Phase 3: Optimiert + Hybrid Search

| Aspekt | Empfehlung |
|--------|-----------|
| **Modell** | BGE-M3 (568M, Dense + Sparse + Multi-Vector) |
| **RAM** | ~568 MB (INT8), ~2.2 GB (FP32) — braucht > 4 GB frei |
| **Alternative** | Hybrid: CareerBERT (DE) + multilingual-e5-small (FR/ES/EN) parallel |
| **Vektor-Suche** | sqlite-vec mit IVF-Index |
| **Hybrid Search** | BGE-M3 liefert semantische UND Keyword-Scores in einem Modell |

### Phase 4: Domain Fine-Tuning

| Aspekt | Empfehlung |
|--------|-----------|
| **Basis** | multilingual-e5-small (bester Kompromiss Größe/Qualität/Sprachen) |
| **Training** | MNR-Loss auf ESCO-Daten (wie CareerBERT), 131K Pairs |
| **Kein TSDAE** | CareerBERT-Paper zeigt: TSDAE verschlechtert Performance |
| **Two-Stage** | Bi-Encoder (Phase 2/3 Modell) + Cross-Encoder Re-Ranking |
| **Feedback-Daten** | Eigene JobSync-Nutzungsdaten aus Feedback-Loop (Phase 1+) |

> **Wichtig:** Englisch-only Modelle (all-MiniLM-L6-v2, ModernBERT-embed-base, BGE-small-en, nomic-embed-text) sind für den deutschen Arbeitsmarkt **nicht geeignet** wegen Tokenizer-Problemen mit Compound-Words.

---

## 6. Hardware-Mindestanforderungen

### Minimum (Phase 1)

| Komponente | Anforderung |
|-----------|-------------|
| CPU | Jeder x86_64 oder ARM64 (2+ Cores) |
| RAM | **2 GB frei** (23 MB Modell + 9 MB Centroids + OS) |
| Disk | 100 MB für Modell + Daten |
| Beispiel | Raspberry Pi 4 (4 GB), alter Laptop, VPS mit 2 GB |

### Empfohlen (Phase 2/3)

| Komponente | Anforderung |
|-----------|-------------|
| CPU | 4+ Cores mit AVX2 (Intel i5+, AMD Ryzen 3+) |
| RAM | **4 GB frei** (150 MB Modell + Centroids + Headroom) |
| Disk | 500 MB SSD |
| Beispiel | Mini-PC, NUC, Standard-VPS |

### Für BGE-M3 / Große Modelle

| Komponente | Anforderung |
|-----------|-------------|
| CPU | 4+ Cores |
| RAM | **8 GB frei** |
| Disk | 2 GB SSD |

---

## 7. Offene Risiken & Architektur-Entscheidungen

### 7.1 DSGVO / Embedding-Datenschutz

CV-Embeddings sind **personenbezogene Daten** (Art. 4 Nr. 1 DSGVO). Risiken:

- **Embedding Inversion Attacks:** Forschung zeigt, dass aus Embeddings teilweise der Originaltext rekonstruiert werden kann. Besonders bei kleineren Modellen mit niedrigeren Dimensionen.
- **Speicherung:** Embeddings müssen verschlüsselt gespeichert werden (AES-256, wie bereits für Module-Credentials implementiert via ADR-016)
- **Löschung:** Art. 17 DSGVO — bei Kontolöschung müssen CV-Embeddings gelöscht werden
- **Einwilligung:** User muss explizit zustimmen, dass sein CV als Vektor gespeichert wird
- **Mitigation:** Self-hosted = Daten verlassen nicht den Server. Aber DB-Zugang = Embedding-Zugang.

**Empfehlung:** Ephemeral Embeddings — CV wird bei jeder Suche neu encoded, Embedding wird nicht persistiert. Nur ESCO-Centroids sind persistent. Nachteil: ~25ms extra Latenz pro Suche.

### 7.2 Embedding-Versionierung

Modellwechsel → alle gespeicherten Embeddings inkompatibel. Schema-Vorschlag:

```sql
-- Embedding-Metadaten
ALTER TABLE job_embeddings ADD COLUMN model_version TEXT NOT NULL DEFAULT 'careerbert-jg-v1';
ALTER TABLE job_embeddings ADD COLUMN embedding_dims INTEGER NOT NULL DEFAULT 768;
ALTER TABLE job_embeddings ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
```

**Migrations-Strategie:**
1. Neues Modell laden, neue Centroids parallel berechnen
2. A/B-Test: alte vs. neue Embeddings vergleichen
3. Umschalten wenn neue Qualität bestätigt
4. Alte Embeddings löschen

### 7.3 Tokenizer-Kompatibilität für Deutsch

| Tokenizer-Typ | Beispiel "Softwareentwicklungsingenieur" | Brauchbar? |
|---------------|----------------------------------------|-----------|
| GBERT (CareerBERT) | `Software` `entwicklungs` `ingenieur` | Ja |
| XLM-R (multilingual-e5, BGE-M3) | `Software` `entwicklung` `s` `ingenieur` | Ja |
| BERT-base-uncased (EN) | `soft` `ware` `ent` `wick` `lung` `sing` `eni` `eur` | Nein |
| ModernBERT (EN) | Ähnlich schlecht wie BERT-base für DE | Nein |

**Fazit:** Für deutschen Arbeitsmarkt kommen nur Modelle mit GBERT- oder XLM-R-Tokenizer in Frage.

### 7.4 Feedback-Loop für kontinuierliche Verbesserung

```
User sieht Match → Thumbs Up/Down → Feedback-Tabelle
                                          ↓
                              Quartalsweise: Re-Training
                              mit User-Feedback als zusätzliche
                              positive/negative Paare
```

Benötigt:
- UI: Thumbs-up/down Button auf Match-Ergebnissen
- DB: `match_feedback` Tabelle (userId, jobEmbeddingId, resumeEmbeddingId, rating, timestamp)
- Pipeline: Export-Script für sentence-transformers Training

### 7.5 ESCO-Update-Strategie

```
Monatlicher Cron → ESCO API Version-Check
  → Neue Version erkannt?
    → Ja: Centroids neu berechnen (Background-Job, ~5 Min für 3K Centroids)
    → Nein: Nichts tun
```

Implementierung über bestehenden Scheduler (RunCoordinator) oder separaten Cron-Job.

### 7.6 Latenz-Budget

| Szenario | Budget | Machbar? |
|----------|--------|----------|
| Real-Time (bei Suche) | Embedding 25ms + Search <1ms = **~30ms** | Ja |
| Mit LLM-Anreicherung (kurze CVs) | + 2-5s LLM-Call | Zu langsam für RT |
| Batch (bei CV-Upload) | Background-Job, User wird benachrichtigt | Ja, immer |

**Empfehlung:** Hybrid — Standard-CVs real-time, kurze CVs batch mit LLM-Anreicherung.

### 7.7 Offline / Erster Start

Modell muss ohne Internet verfügbar sein. Optionen:

| Ansatz | Docker-Image-Größe | Erster Start | Internet nötig? |
|--------|-------------------|-------------|----------------|
| Im Docker-Image bündeln | +110-470 MB | Sofort | Nein |
| Lazy Download beim ersten Start | Unverändert | +30s-2min Download | Einmalig ja |
| Separater Model-Volume | Unverändert | Sofort (wenn Volume da) | Einmalig ja |

**Empfehlung:** Separater Docker-Volume + Health-Check der prüft ob Modell vorhanden ist.

### 7.8 A/B-Testing-Plan

1. **Offline-Evaluation:** 50+ eigene CV-Job-Paare als Goldstandard definieren
2. **Automatische Metriken:** MRR@20, MAP@20, P@20 (wie im CareerBERT-Paper)
3. **User-Evaluation:** Feedback-Loop Daten (ab Phase 1)
4. **Vergleich:** Jedes neue Modell muss den Goldstandard mindestens so gut erfüllen wie das aktuelle

---


### Papers
- [CareerBERT (Rosenberger 2025)](https://arxiv.org/abs/2503.02056)
- [TurboQuant (Google, ICLR 2026)](https://arxiv.org/abs/2504.19874)
- [RaBitQ (SIGMOD 2024)](https://arxiv.org/abs/2405.12497)
- [MMTEB: Massive Multilingual Text Embedding Benchmark](https://arxiv.org/abs/2502.13595)

### Modelle (HuggingFace)
- [ModernBERT-embed-base](https://huggingface.co/nomic-ai/modernbert-embed-base) — Apache 2.0, Matryoshka
- [nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — Apache 2.0, Matryoshka bis 64 Dims
- [BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) — MIT, 33.4M Params
- [BGE-M3](https://huggingface.co/BAAI/bge-m3) — MIT, 100+ Sprachen
- [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) — MIT, 100+ Sprachen
- [CareerBERT-JG](https://huggingface.co/lwolfrum2/careerbert-jg)
- [CareerBERT-G](https://huggingface.co/lwolfrum2/careerbert-g)

### Tools & Libraries
- [Transformers.js v4](https://huggingface.co/blog/transformersjs-v4) — HuggingFace, Node.js/Browser
- [ONNX Runtime](https://onnxruntime.ai/) — Microsoft, optimierte Inferenz
- [bert.cpp](https://github.com/skeskinen/bert.cpp) — C++, 4-Bit Quantisierung
- [fastembed-js](https://github.com/Anush008/fastembed-js) — Qdrant, Node.js Embeddings
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — Vektor-Suche in SQLite
- [sentence-transformers ONNX docs](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- [Intel CPU-Optimized Embeddings](https://huggingface.co/blog/intel-fast-embedding)
- [Microsoft ONNX Runtime Next.js Template](https://github.com/microsoft/onnxruntime-nextjs-template)
- [Matryoshka Embeddings Guide](https://huggingface.co/blog/matryoshka)

### Benchmarks
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [Best Embedding Models for RAG 2026](https://blog.premai.io/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/)
- [Embedding Models Benchmark 2026](https://zc277584121.github.io/rag/2026/03/20/embedding-models-benchmark-2026.html)
- [Open Source Embedding Models Benchmarked](https://supermemory.ai/blog/best-open-source-embedding-models-benchmarked-and-ranked/)
