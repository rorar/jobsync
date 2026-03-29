/**
 * Unit tests for useAutomationWizard hook.
 *
 * Tests step navigation, module change, scheduleFrequency as first-class field,
 * and edit mode pre-population.
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock("@/actions/automation.actions", () => ({
  createAutomation: jest.fn(),
  updateAutomation: jest.fn(),
}));

jest.mock("@/actions/apiKey.actions", () => ({
  getUserApiKeys: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

jest.mock("@/actions/module.actions", () => ({
  getActiveModules: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAutomationWizard,
  STEP_KEYS,
  SCHEDULE_FREQUENCIES,
  FREQUENCY_TRANSLATION_KEYS,
  type ScheduleFrequency,
} from "@/components/automations/useAutomationWizard";
import { getActiveModules } from "@/actions/module.actions";
import { getUserApiKeys } from "@/actions/apiKey.actions";
import { createAutomation, updateAutomation } from "@/actions/automation.actions";
import type { AutomationWithResume } from "@/models/automation.model";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import type { UseAutomationWizardOptions } from "@/components/automations/useAutomationWizard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResumes = [
  { id: "resume-fixture-id-1111-111111111111", title: "Software Engineer Resume" },
];

const mockOnOpenChange = jest.fn();
const mockOnSuccess = jest.fn();

const baseOptions: UseAutomationWizardOptions = {
  open: true,
  resumes: mockResumes,
  onOpenChange: mockOnOpenChange,
  onSuccess: mockOnSuccess,
};

function makeModuleSummary(
  moduleId: string,
  overrides: Partial<ModuleManifestSummary> = {},
): ModuleManifestSummary {
  return {
    moduleId,
    name: moduleId.toUpperCase(),
    manifestVersion: 1,
    connectorType: "job_discovery",
    status: "active",
    healthStatus: "unknown",
    credential: { type: "none", moduleId, required: false, sensitive: false },
    ...overrides,
  };
}

function makeEditAutomation(overrides: Partial<AutomationWithResume> = {}): AutomationWithResume {
  return {
    id: "automation-fixture-id",
    userId: "user-1",
    name: "My EURES Search",
    jobBoard: "eures",
    keywords: "Software Developer",
    location: "de",
    connectorParams: JSON.stringify({ publicationPeriod: "LAST_MONTH", language: "de" }),
    resumeId: "resume-fixture-id-1111-111111111111",
    matchThreshold: 75,
    scheduleHour: 9,
    scheduleFrequency: "weekly",
    nextRunAt: new Date(),
    lastRunAt: null,
    status: "active",
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resume: { id: "resume-fixture-id-1111-111111111111", title: "Software Engineer Resume" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: render hook and wait for initial data loading
// ---------------------------------------------------------------------------

async function renderWizard(options: UseAutomationWizardOptions = baseOptions) {
  const { result } = renderHook(() => useAutomationWizard(options));
  // Wait for the initial async effects (getUserApiKeys + getActiveModules) to settle
  await waitFor(() => expect(getUserApiKeys).toHaveBeenCalled());
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAutomationWizard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUserApiKeys as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: [] });
  });

  // ── Constants ─────────────────────────────────────────────────────────────

  describe("constants", () => {
    it("STEP_KEYS has 6 steps", () => {
      expect(STEP_KEYS).toHaveLength(6);
    });

    it("STEP_KEYS ids match expected wizard flow", () => {
      const ids = STEP_KEYS.map((s) => s.id);
      expect(ids).toEqual(["basics", "search", "resume", "matching", "schedule", "review"]);
    });

    it("SCHEDULE_FREQUENCIES includes all 5 values", () => {
      expect(SCHEDULE_FREQUENCIES).toEqual(["6h", "12h", "daily", "2d", "weekly"]);
    });

    it("FREQUENCY_TRANSLATION_KEYS covers every schedule frequency", () => {
      for (const freq of SCHEDULE_FREQUENCIES) {
        expect(FREQUENCY_TRANSLATION_KEYS[freq]).toBeDefined();
        expect(typeof FREQUENCY_TRANSLATION_KEYS[freq]).toBe("string");
      }
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts at step 0", async () => {
      const result = await renderWizard();
      expect(result.current.state.step).toBe(0);
    });

    it("defaults scheduleFrequency to 'daily'", async () => {
      const result = await renderWizard();
      expect(result.current.state.scheduleFrequency).toBe("daily");
    });

    it("defaults aiScoringEnabled to true", async () => {
      const result = await renderWizard();
      expect(result.current.state.aiScoringEnabled).toBe(true);
    });

    it("isEditMode is false when no editAutomation provided", async () => {
      const result = await renderWizard();
      expect(result.current.state.isEditMode).toBe(false);
    });

    it("initialises connectorParamsValues as empty object", async () => {
      const result = await renderWizard();
      expect(result.current.state.connectorParamsValues).toEqual({});
    });
  });

  // ── Step navigation ───────────────────────────────────────────────────────

  describe("step navigation", () => {
    it("next() increments step", async () => {
      const result = await renderWizard();

      // Prime basics step with a valid name so canGoNext passes
      act(() => {
        result.current.state.form.setValue("name", "My Automation");
      });

      act(() => {
        result.current.actions.next();
      });

      expect(result.current.state.step).toBe(1);
    });

    it("back() decrements step", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.state.form.setValue("name", "My Automation");
      });
      act(() => { result.current.actions.next(); });
      act(() => { result.current.actions.back(); });

      expect(result.current.state.step).toBe(0);
    });

    it("back() does nothing when already at step 0", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.back(); });
      expect(result.current.state.step).toBe(0);
    });

    it("next() does not go beyond the last step", async () => {
      const result = await renderWizard();
      const lastStep = STEP_KEYS.length - 1;

      act(() => { result.current.actions.goTo(lastStep); });
      act(() => { result.current.actions.next(); });

      expect(result.current.state.step).toBe(lastStep);
    });

    it("goTo() jumps to an arbitrary valid step", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.goTo(3); });

      expect(result.current.state.step).toBe(3);
    });

    it("goTo() ignores out-of-range step numbers", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.goTo(-1); });
      expect(result.current.state.step).toBe(0);

      act(() => { result.current.actions.goTo(999); });
      expect(result.current.state.step).toBe(0);
    });
  });

  // ── canGoNext() ───────────────────────────────────────────────────────────

  describe("canGoNext", () => {
    it("returns false at step 0 when name is empty", async () => {
      const result = await renderWizard();
      act(() => { result.current.state.form.setValue("name", ""); });
      expect(result.current.actions.canGoNext()).toBe(false);
    });

    it("returns true at step 0 when name is set", async () => {
      const result = await renderWizard();
      act(() => { result.current.state.form.setValue("name", "Some Name"); });
      expect(result.current.actions.canGoNext()).toBe(true);
    });

    it("returns false at step 1 when keywords or location are empty", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.goTo(1); });
      act(() => {
        result.current.state.form.setValue("keywords", "");
        result.current.state.form.setValue("location", "");
      });
      expect(result.current.actions.canGoNext()).toBe(false);
    });

    it("returns true at step 1 when both keywords and location are set", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.goTo(1); });
      act(() => {
        result.current.state.form.setValue("keywords", "engineer");
        result.current.state.form.setValue("location", "Berlin");
      });
      expect(result.current.actions.canGoNext()).toBe(true);
    });

    it("returns false at step 2 when resumeId is empty", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.goTo(2); });
      act(() => { result.current.state.form.setValue("resumeId", ""); });
      expect(result.current.actions.canGoNext()).toBe(false);
    });

    it("returns true at step 2 when a valid resumeId is set", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.goTo(2); });
      act(() => {
        result.current.state.form.setValue("resumeId", "resume-fixture-id-1111-111111111111");
      });
      expect(result.current.actions.canGoNext()).toBe(true);
    });

    it("returns true at steps 3 and 4 unconditionally", async () => {
      const result = await renderWizard();
      act(() => { result.current.actions.goTo(3); });
      expect(result.current.actions.canGoNext()).toBe(true);
      act(() => { result.current.actions.goTo(4); });
      expect(result.current.actions.canGoNext()).toBe(true);
    });
  });

  // ── setModule / module change ─────────────────────────────────────────────

  describe("module change", () => {
    it("setModule updates the form's jobBoard field", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.setModule("eures"); });

      expect(result.current.state.form.getValues("jobBoard")).toBe("eures");
    });

    it("jobBoard state reflects the form value", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.setModule("arbeitsagentur"); });

      expect(result.current.state.jobBoard).toBe("arbeitsagentur");
    });

    it("apples schema defaults when module changes to a module with a schema", async () => {
      const moduleWithDefaults = makeModuleSummary("arbeitsagentur", {
        connectorParamsSchema: [
          { key: "umkreis", type: "number", label: "Radius", defaultValue: 25 },
          { key: "sortOrder", type: "select", label: "Sort", options: ["asc", "desc"] },
        ],
      });

      (getActiveModules as jest.Mock).mockResolvedValue({
        success: true,
        data: [makeModuleSummary("jsearch"), moduleWithDefaults],
      });

      const result = await renderWizard();

      await act(async () => {
        result.current.actions.setModule("arbeitsagentur");
        // Let the schema-defaults effect run
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.state.connectorParamsValues["umkreis"]).toBe(25);
      });
    });

    it("does not apply defaults when editAutomation is the same module", async () => {
      const editAutomation = makeEditAutomation({
        jobBoard: "eures",
        connectorParams: JSON.stringify({ publicationPeriod: "LAST_MONTH" }),
      });
      const euresModule = makeModuleSummary("eures", {
        connectorParamsSchema: [
          {
            key: "publicationPeriod", type: "select", label: "Period",
            defaultValue: "LAST_WEEK", options: ["LAST_WEEK", "LAST_MONTH"],
          },
        ],
      });

      (getActiveModules as jest.Mock).mockResolvedValue({
        success: true,
        data: [euresModule],
      });

      const result = await renderWizard({ ...baseOptions, editAutomation });

      // Default would be LAST_WEEK, but edit pre-populated LAST_MONTH
      await waitFor(() => {
        expect(result.current.state.connectorParamsValues["publicationPeriod"]).toBe("LAST_MONTH");
      });
    });
  });

  // ── updateConnectorParam ──────────────────────────────────────────────────

  describe("updateConnectorParam", () => {
    it("adds a new connector param value", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.updateConnectorParam("publicationPeriod", "LAST_MONTH");
      });

      expect(result.current.state.connectorParamsValues["publicationPeriod"]).toBe("LAST_MONTH");
    });

    it("overwrites an existing connector param value", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.updateConnectorParam("publicationPeriod", "LAST_WEEK");
      });
      act(() => {
        result.current.actions.updateConnectorParam("publicationPeriod", "LAST_MONTH");
      });

      expect(result.current.state.connectorParamsValues["publicationPeriod"]).toBe("LAST_MONTH");
    });

    it("preserves existing params when adding a new one", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.updateConnectorParam("alpha", "a");
        result.current.actions.updateConnectorParam("beta", "b");
      });

      expect(result.current.state.connectorParamsValues).toMatchObject({ alpha: "a", beta: "b" });
    });
  });

  // ── scheduleFrequency as first-class field ────────────────────────────────

  describe("scheduleFrequency", () => {
    it("handleScheduleFrequencyChange updates scheduleFrequency state", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.handleScheduleFrequencyChange("weekly");
      });

      expect(result.current.state.scheduleFrequency).toBe("weekly");
    });

    it("accepts all valid frequency values", async () => {
      const result = await renderWizard();
      const freqs: ScheduleFrequency[] = ["6h", "12h", "daily", "2d", "weekly"];

      for (const freq of freqs) {
        act(() => {
          result.current.actions.handleScheduleFrequencyChange(freq);
        });
        expect(result.current.state.scheduleFrequency).toBe(freq);
      }
    });

    it("scheduleFrequency is attached to submit data", async () => {
      (createAutomation as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: "new-automation-id" },
      });

      const result = await renderWizard();

      act(() => {
        result.current.actions.handleScheduleFrequencyChange("weekly");
      });

      const formData = {
        name: "Test",
        jobBoard: "jsearch",
        keywords: "engineer",
        location: "Berlin",
        resumeId: "resume-fixture-id-1111-111111111111",
        matchThreshold: 80,
        scheduleHour: 8,
        scheduleFrequency: "daily" as ScheduleFrequency,
      };

      await act(async () => {
        await result.current.actions.submit(formData);
      });

      expect(createAutomation).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleFrequency: "weekly" }),
      );
    });

    it("getScheduleReviewText returns daily format with hour for daily frequency", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.handleScheduleFrequencyChange("daily");
        result.current.state.form.setValue("scheduleHour", 9);
      });

      const text = result.current.actions.getScheduleReviewText();
      expect(text).toContain("09:00");
    });

    it("getScheduleReviewText returns frequency label + hour for non-daily", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.handleScheduleFrequencyChange("weekly");
        result.current.state.form.setValue("scheduleHour", 7);
      });

      const text = result.current.actions.getScheduleReviewText();
      expect(text).toContain("07:00");
    });
  });

  // ── AI scoring toggle ─────────────────────────────────────────────────────

  describe("handleAiScoringToggle", () => {
    it("disabling AI scoring sets matchThreshold to 0", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.handleAiScoringToggle(false);
      });

      expect(result.current.state.aiScoringEnabled).toBe(false);
      expect(result.current.state.form.getValues("matchThreshold")).toBe(0);
    });

    it("enabling AI scoring resets matchThreshold to 80", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.handleAiScoringToggle(false); });
      act(() => { result.current.actions.handleAiScoringToggle(true); });

      expect(result.current.state.aiScoringEnabled).toBe(true);
      expect(result.current.state.form.getValues("matchThreshold")).toBe(80);
    });

    it("getMatchThresholdReviewText returns percentage when AI enabled", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.handleAiScoringToggle(true);
        result.current.state.form.setValue("matchThreshold", 70);
      });

      expect(result.current.actions.getMatchThresholdReviewText()).toBe("70%");
    });

    it("getMatchThresholdReviewText returns collect-only key when AI disabled", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.handleAiScoringToggle(false); });

      const text = result.current.actions.getMatchThresholdReviewText();
      // The mock t() returns the key itself
      expect(text).toBe("automations.collectOnlyMode");
    });
  });

  // ── Edit mode ─────────────────────────────────────────────────────────────

  describe("edit mode", () => {
    it("isEditMode is true when editAutomation is provided", async () => {
      const editAutomation = makeEditAutomation();
      const result = await renderWizard({ ...baseOptions, editAutomation });
      expect(result.current.state.isEditMode).toBe(true);
    });

    it("pre-populates form name from editAutomation", async () => {
      const editAutomation = makeEditAutomation({ name: "Pre-filled Name" });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.form.getValues("name")).toBe("Pre-filled Name");
      });
    });

    it("pre-populates jobBoard from editAutomation", async () => {
      const editAutomation = makeEditAutomation({ jobBoard: "eures" });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.form.getValues("jobBoard")).toBe("eures");
      });
    });

    it("pre-populates scheduleFrequency from editAutomation.scheduleFrequency", async () => {
      const editAutomation = makeEditAutomation({ scheduleFrequency: "weekly" });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.scheduleFrequency).toBe("weekly");
      });
    });

    it("pre-populates user connector params from editAutomation.connectorParams", async () => {
      const editAutomation = makeEditAutomation({
        jobBoard: "eures",
        connectorParams: JSON.stringify({
          publicationPeriod: "LAST_MONTH",
          language: "de", // system key managed by EURES auto-injection
        }),
      });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      // User-editable params like publicationPeriod must be restored from the saved JSON
      await waitFor(() => {
        expect(result.current.state.connectorParamsValues["publicationPeriod"]).toBe("LAST_MONTH");
      });
    });

    it("strips scheduleFrequency from connectorParams (it lives in its own DB column)", async () => {
      // Older automations may have had scheduleFrequency embedded in connectorParams JSON.
      // The reset effect strips it so the form doesn't show a spurious dynamic field.
      const editAutomation = makeEditAutomation({
        connectorParams: JSON.stringify({
          scheduleFrequency: "weekly", // legacy key — should be stripped
          publicationPeriod: "LAST_WEEK",
        }),
        scheduleFrequency: "weekly",
      });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.connectorParamsValues["scheduleFrequency"]).toBeUndefined();
      });
    });

    it("restores AI scoring OFF when editAutomation.matchThreshold is 0", async () => {
      const editAutomation = makeEditAutomation({ matchThreshold: 0 });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.aiScoringEnabled).toBe(false);
      });
    });

    it("restores AI scoring ON when editAutomation.matchThreshold > 0", async () => {
      const editAutomation = makeEditAutomation({ matchThreshold: 65 });
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await waitFor(() => {
        expect(result.current.state.aiScoringEnabled).toBe(true);
      });
    });

    it("calls updateAutomation (not createAutomation) on submit", async () => {
      (updateAutomation as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: "automation-fixture-id" },
      });
      const editAutomation = makeEditAutomation();
      const result = await renderWizard({ ...baseOptions, editAutomation });

      await act(async () => {
        await result.current.actions.submit({
          name: "Updated Name",
          jobBoard: "eures",
          keywords: "engineer",
          location: "de",
          resumeId: "resume-fixture-id-1111-111111111111",
          matchThreshold: 75,
          scheduleHour: 9,
          scheduleFrequency: "weekly" as ScheduleFrequency,
        });
      });

      expect(updateAutomation).toHaveBeenCalledWith(
        "automation-fixture-id",
        expect.objectContaining({ name: "Updated Name" }),
      );
      expect(createAutomation).not.toHaveBeenCalled();
    });
  });

  // ── handleClose ───────────────────────────────────────────────────────────

  describe("handleClose", () => {
    it("resets step to 0 and calls onOpenChange(false)", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.goTo(3); });
      act(() => { result.current.actions.handleClose(); });

      expect(result.current.state.step).toBe(0);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("clears connectorParamsValues on close", async () => {
      const result = await renderWizard();

      act(() => {
        result.current.actions.updateConnectorParam("foo", "bar");
      });
      act(() => {
        result.current.actions.handleClose();
      });

      expect(result.current.state.connectorParamsValues).toEqual({});
    });
  });

  // ── EURES language auto-injection ─────────────────────────────────────────

  describe("EURES language auto-injection", () => {
    it("injects document.documentElement.lang into connectorParamsValues when eures is selected", async () => {
      // Simulate a German browser
      Object.defineProperty(document.documentElement, "lang", {
        value: "de",
        writable: true,
        configurable: true,
      });

      const euresModule = makeModuleSummary("eures");
      (getActiveModules as jest.Mock).mockResolvedValue({
        success: true,
        data: [makeModuleSummary("jsearch"), euresModule],
      });

      const result = await renderWizard();

      act(() => { result.current.actions.setModule("eures"); });

      await waitFor(() => {
        expect(result.current.state.connectorParamsValues["language"]).toBe("de");
      });

      // Restore
      Object.defineProperty(document.documentElement, "lang", {
        value: "",
        writable: true,
        configurable: true,
      });
    });

    it("does not inject language when module is not eures", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.setModule("jsearch"); });

      // Give effects a tick
      await act(async () => { await Promise.resolve(); });

      expect(result.current.state.connectorParamsValues["language"]).toBeUndefined();
    });
  });

  // ── runAfterCreate ────────────────────────────────────────────────────────

  describe("runAfterCreate", () => {
    it("setRunAfterCreate updates runAfterCreate state", async () => {
      const result = await renderWizard();

      act(() => { result.current.actions.setRunAfterCreate(true); });

      expect(result.current.state.runAfterCreate).toBe(true);
    });
  });

  // ── module load ───────────────────────────────────────────────────────────

  describe("module loading", () => {
    it("populates availableModules from getActiveModules response", async () => {
      const modules = [makeModuleSummary("jsearch"), makeModuleSummary("eures")];
      (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: modules });

      const result = await renderWizard();

      await waitFor(() => {
        expect(result.current.state.availableModules).toHaveLength(2);
      });
    });

    it("sets availableModules to empty array when getActiveModules fails", async () => {
      (getActiveModules as jest.Mock).mockResolvedValue({ success: false });

      const result = await renderWizard();

      await waitFor(() => {
        expect(result.current.state.availableModules).toEqual([]);
      });
    });

    it("paramsSchema is null when selected module has no connectorParamsSchema", async () => {
      const modules = [makeModuleSummary("jsearch")];
      (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: modules });

      const result = await renderWizard();

      act(() => { result.current.actions.setModule("jsearch"); });

      await waitFor(() => {
        expect(result.current.state.paramsSchema).toBeNull();
      });
    });

    it("paramsSchema reflects selected module schema", async () => {
      const schema = [{ key: "umkreis", type: "number" as const, label: "Radius", defaultValue: 25 }];
      const modules = [makeModuleSummary("arbeitsagentur", { connectorParamsSchema: schema })];
      (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: modules });

      const result = await renderWizard();

      act(() => { result.current.actions.setModule("arbeitsagentur"); });

      await waitFor(() => {
        expect(result.current.state.paramsSchema).toEqual(schema);
      });
    });

    it("searchFieldOverrides is empty array when module has no overrides", async () => {
      const modules = [makeModuleSummary("jsearch")];
      (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: modules });

      const result = await renderWizard();

      act(() => { result.current.actions.setModule("jsearch"); });

      await waitFor(() => {
        expect(result.current.state.searchFieldOverrides).toEqual([]);
      });
    });

    it("searchFieldOverrides reflects selected module overrides", async () => {
      const overrides = [{ field: "keywords" as const, widgetId: "eures-occupation" }];
      const modules = [makeModuleSummary("eures", { searchFieldOverrides: overrides })];
      (getActiveModules as jest.Mock).mockResolvedValue({ success: true, data: modules });

      const result = await renderWizard();

      act(() => { result.current.actions.setModule("eures"); });

      await waitFor(() => {
        expect(result.current.state.searchFieldOverrides).toEqual(overrides);
      });
    });
  });
});
