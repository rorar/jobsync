/**
 * ApiKeySettings component tests
 *
 * Tests: module name rendering via i18n, credential hints, endpoint_url vs
 * api_key label differences, inactive/active state, activation toggle.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "settings.apiKeys": "API Keys",
        "settings.apiKeysDesc": "Manage API keys for external integrations.",
        "settings.apiKeysDescSecure": "Keys are stored securely.",
        "settings.loadingKeys": "Loading API keys...",
        "settings.moduleActive": "Active",
        "settings.moduleInactive": "Inactive",
        "settings.moduleActivated": "Module activated.",
        "settings.moduleDeactivated": "Module deactivated.",
        "settings.automationsPaused": "{count} automation(s) paused.",
        "settings.error": "Error",
        "settings.unexpectedError": "An unexpected error occurred",
        "settings.notConfigured": "Not configured",
        "settings.addKey": "Add Key",
        "settings.updateKey": "Update Key",
        "settings.verifySave": "Verify & Save",
        "settings.cancel": "Cancel",
        "settings.delete": "Delete",
        "settings.deleteApiKey": "Delete API Key",
        "settings.deleteApiKeyDesc": "This will permanently remove the key.",
        "settings.apiKey": "API Key",
        "settings.baseUrl": "Base URL",
        "settings.lastConnected": "Last connected",
        "settings.verificationFailed": "Verification failed",
        "settings.couldNotVerifyKey": "Could not verify key",
        "settings.apiKeySaved": "API key saved",
        "settings.keyVerifiedAndSaved": "Key verified and saved for {module}.",
        "settings.saveFailed": "Save failed",
        "settings.failedToSaveApiKey": "Failed to save API key",
        "settings.failedToDeleteApiKey": "Failed to delete API key",
        "settings.apiKeyDeleted": "API key deleted",
        "settings.keyRemoved": "Key removed for {module}.",
        "settings.healthCheckNow": "Check now",
        "settings.healthCheckRunning": "Checking...",
        "settings.healthCheckSuccess": "Health check for {module}: {status} ({time}ms)",
        "settings.healthCheckFailed": "Health check failed for {module}",
        "enrichment.health.healthy": "Healthy",
        "enrichment.health.degraded": "Degraded",
        "enrichment.health.unreachable": "Unreachable",
        "enrichment.health.unknown": "Unknown",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateCompact: jest.fn(() => "Apr 8, 2026"),
}));

const mockGetCredentialModules = jest.fn();
const mockActivateModule = jest.fn();
const mockDeactivateModule = jest.fn();
const mockRunHealthCheck = jest.fn();

jest.mock("@/actions/module.actions", () => ({
  getCredentialModules: (...args: unknown[]) =>
    mockGetCredentialModules(...args),
  activateModule: (...args: unknown[]) => mockActivateModule(...args),
  deactivateModule: (...args: unknown[]) => mockDeactivateModule(...args),
  runHealthCheck: (...args: unknown[]) => mockRunHealthCheck(...args),
}));

const mockGetUserApiKeys = jest.fn();
const mockSaveApiKey = jest.fn();
const mockDeleteApiKey = jest.fn();
const mockGetDefaultOllamaBaseUrl = jest.fn();

jest.mock("@/actions/apiKey.actions", () => ({
  getUserApiKeys: (...args: unknown[]) => mockGetUserApiKeys(...args),
  saveApiKey: (...args: unknown[]) => mockSaveApiKey(...args),
  deleteApiKey: (...args: unknown[]) => mockDeleteApiKey(...args),
  getDefaultOllamaBaseUrl: (...args: unknown[]) =>
    mockGetDefaultOllamaBaseUrl(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Lucide icons -- minimal stubs
jest.mock("lucide-react", () => {
  const icons = new Proxy(
    {},
    {
      get: (_, name) => {
        const Component = (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        );
        Component.displayName = String(name);
        return Component;
      },
    },
  );
  return icons;
});

import ApiKeySettings from "@/components/settings/ApiKeySettings";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** OpenAI — api_key credential type, active, no existing key */
const openaiModule = {
  moduleId: "openai",
  name: "OpenAI",
  manifestVersion: 1,
  connectorType: "ai_provider",
  status: "inactive",
  healthStatus: "unknown",
  credential: {
    type: "api_key",
    moduleId: "openai",
    required: true,
    sensitive: true,
    placeholder: "sk-...",
  },
  i18n: {
    en: {
      name: "OpenAI",
      description: "GPT models via OpenAI API",
      credentialHint: "Enter your OpenAI API key starting with sk-",
    },
    de: {
      name: "OpenAI",
      description: "GPT-Modelle über OpenAI API",
      credentialHint: "OpenAI API-Schlüssel eingeben",
    },
  },
};

/** Ollama — endpoint_url credential type, active */
const ollamaModule = {
  moduleId: "ollama",
  name: "Ollama",
  manifestVersion: 1,
  connectorType: "ai_provider",
  status: "active",
  healthStatus: "healthy",
  credential: {
    type: "endpoint_url",
    moduleId: "ollama",
    required: false,
    sensitive: false,
    placeholder: "http://127.0.0.1:11434",
  },
  i18n: {
    en: {
      name: "Ollama",
      description: "Local LLM via Ollama",
      credentialHint: "Base URL of your local Ollama instance",
    },
    de: {
      name: "Ollama",
      description: "Lokales LLM via Ollama",
      credentialHint: "Basis-URL der lokalen Ollama-Instanz",
    },
  },
};

/** Existing API key record for openai (active/configured state) */
const openaiKeyRecord = {
  id: "key-1",
  moduleId: "openai" as const,
  last4: "1234",
  label: null,
  createdAt: new Date("2026-01-01"),
  lastUsedAt: null,
};

/** Existing endpoint record for ollama */
const ollamaKeyRecord = {
  id: "key-2",
  moduleId: "ollama" as const,
  last4: "11434",
  displayValue: "http://127.0.0.1:11434",
  label: null,
  createdAt: new Date("2026-01-01"),
  lastUsedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockGetDefaultOllamaBaseUrl.mockResolvedValue("http://127.0.0.1:11434");
  mockGetUserApiKeys.mockResolvedValue({ success: true, data: [] });
  mockGetCredentialModules.mockResolvedValue({
    success: true,
    data: [openaiModule, ollamaModule],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ApiKeySettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Renders module names from i18n
  // -------------------------------------------------------------------------

  it("renders module names from i18n, not raw manifest names", async () => {
    render(<ApiKeySettings />);

    await waitFor(() => {
      // i18n name resolved via getModuleName(module, locale)
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Ollama")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Renders credential hints
  // -------------------------------------------------------------------------

  it("renders credentialHint text under each module card", async () => {
    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(
        screen.getByText("Enter your OpenAI API key starting with sk-"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Base URL of your local Ollama instance"),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. endpoint_url modules show "Base URL" label instead of "API Key"
  // -------------------------------------------------------------------------

  it("shows 'Base URL' label when editing the ollama (endpoint_url) module", async () => {
    render(<ApiKeySettings />);

    // Wait for modules to load
    await waitFor(() => {
      expect(screen.getByText("Ollama")).toBeInTheDocument();
    });

    // Find the "Add Key" button for Ollama and click it to enter edit mode
    const addButtons = screen.getAllByRole("button", { name: /add key/i });
    // Ollama is the second module
    fireEvent.click(addButtons[1]);

    await waitFor(() => {
      expect(screen.getByText("Base URL")).toBeInTheDocument();
    });
    // "API Key" label should NOT appear for ollama
    expect(screen.queryByText("API Key")).not.toBeInTheDocument();
  });

  it("shows 'API Key' label when editing the openai (api_key) module", async () => {
    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    // Click the first "Add Key" button (openai)
    const addButtons = screen.getAllByRole("button", { name: /add key/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });
    expect(screen.queryByText("Base URL")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 4. Shows inactive state for modules without configured credentials
  // -------------------------------------------------------------------------

  it("shows 'Not configured' badge for modules without a saved key", async () => {
    // No keys in store — both modules unconfigured
    mockGetUserApiKeys.mockResolvedValue({ success: true, data: [] });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    const notConfiguredBadges = screen.getAllByText("Not configured");
    expect(notConfiguredBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows module inactive status text for inactive modules", async () => {
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [openaiModule], // openai has status: "inactive"
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. Shows active state for modules with configured credentials
  // -------------------------------------------------------------------------

  it("shows green badge with masked key for sensitive configured modules", async () => {
    mockGetUserApiKeys.mockResolvedValue({
      success: true,
      data: [openaiKeyRecord],
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    // Sensitive key shows last4 masked: "····1234"
    expect(screen.getByText("····1234")).toBeInTheDocument();
  });

  it("shows health check button enabled for active modules", async () => {
    mockGetUserApiKeys.mockResolvedValue({
      success: true,
      data: [ollamaKeyRecord],
    });
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [ollamaModule], // status: active
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("Ollama")).toBeInTheDocument();
    });

    const healthCheckButton = screen.getByRole("button", { name: /check now/i });
    expect(healthCheckButton).not.toBeDisabled();
  });

  it("shows health check button disabled for inactive modules", async () => {
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [openaiModule], // status: inactive
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    const healthCheckButton = screen.getByRole("button", { name: /check now/i });
    expect(healthCheckButton).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // 6. Toggle module activation
  // -------------------------------------------------------------------------

  it("calls activateModule when toggling an inactive module on", async () => {
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [openaiModule], // status: inactive
    });
    mockActivateModule.mockResolvedValue({
      success: true,
      data: { moduleId: "openai", status: "active" },
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockActivateModule).toHaveBeenCalledWith("openai");
    });
  });

  it("calls deactivateModule when toggling an active module off", async () => {
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [ollamaModule], // status: active
    });
    mockDeactivateModule.mockResolvedValue({
      success: true,
      data: { moduleId: "ollama", status: "inactive", pausedAutomations: 0 },
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("Ollama")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockDeactivateModule).toHaveBeenCalledWith("ollama");
    });
  });

  it("shows error toast when activateModule fails", async () => {
    mockGetCredentialModules.mockResolvedValue({
      success: true,
      data: [openaiModule],
    });
    mockActivateModule.mockResolvedValue({
      success: false,
      message: "Module not found",
    });

    render(<ApiKeySettings />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Error",
        }),
      );
    });
  });
});
