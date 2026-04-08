import type { ModuleI18n } from "@/lib/connector/manifest";

export const openaiI18n: ModuleI18n = {
  en: { name: "OpenAI", description: "AI models via OpenAI API (API key required)", credentialHint: "GPT-4o, GPT-4 Turbo, and other OpenAI models" },
  de: { name: "OpenAI", description: "KI-Modelle über OpenAI API (API-Key erforderlich)", credentialHint: "GPT-4o, GPT-4 Turbo und andere OpenAI-Modelle" },
  fr: { name: "OpenAI", description: "Modèles IA via l'API OpenAI (clé API requise)", credentialHint: "GPT-4o, GPT-4 Turbo et autres modèles OpenAI" },
  es: { name: "OpenAI", description: "Modelos de IA vía la API de OpenAI (clave API requerida)", credentialHint: "GPT-4o, GPT-4 Turbo y otros modelos de OpenAI" },
};
