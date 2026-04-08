import type { ModuleI18n } from "@/lib/connector/manifest";

export const ollamaI18n: ModuleI18n = {
  en: { name: "Ollama", description: "Local AI models via Ollama (no API key required)", credentialHint: "Run open-source models locally with Ollama" },
  de: { name: "Ollama", description: "Lokale KI-Modelle über Ollama (kein API-Key nötig)", credentialHint: "Open-Source-Modelle lokal mit Ollama ausführen" },
  fr: { name: "Ollama", description: "Modèles IA locaux via Ollama (aucune clé API requise)", credentialHint: "Exécutez des modèles open source localement avec Ollama" },
  es: { name: "Ollama", description: "Modelos de IA locales vía Ollama (sin clave API)", credentialHint: "Ejecuta modelos de código abierto localmente con Ollama" },
};
