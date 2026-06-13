/**
 * Welle 4 — stage-colors: colour-token resolution keyed by the design-token
 * colour NAME (blue/indigo/...), never by a status value. Drives the Kanban /
 * settings stage colour via a CSS custom property.
 */
import {
  STAGE_COLOR_TOKENS,
  resolveStageColor,
  stageColorVar,
} from "@/lib/crm/stage-colors";

describe("stage-colors", () => {
  it("has a token for every seeded stage colour name", () => {
    for (const name of ["blue", "indigo", "purple", "green", "emerald", "red", "gray"]) {
      expect(STAGE_COLOR_TOKENS[name]).toBeDefined();
      expect(STAGE_COLOR_TOKENS[name].base).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("resolveStageColor returns the matching token", () => {
    expect(resolveStageColor("indigo")).toBe(STAGE_COLOR_TOKENS.indigo);
  });

  it("resolveStageColor falls back to gray for an unknown colour name", () => {
    expect(resolveStageColor("chartreuse")).toBe(STAGE_COLOR_TOKENS.gray);
    expect(resolveStageColor(undefined as unknown as string)).toBe(STAGE_COLOR_TOKENS.gray);
  });

  it("stageColorVar exposes the base colour as the --stage-color custom property", () => {
    const style = stageColorVar("emerald");
    expect(style["--stage-color"]).toBe(STAGE_COLOR_TOKENS.emerald.base);
  });

  it("stageColorVar is safe for an unknown colour (falls back to gray)", () => {
    const style = stageColorVar("not-a-colour");
    expect(style["--stage-color"]).toBe(STAGE_COLOR_TOKENS.gray.base);
  });
});
