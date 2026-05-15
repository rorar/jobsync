/**
 * Tests for src/lib/storage.ts — Centralized Storage Path Resolution (T-2).
 *
 * Tests the DATA_DIR fallback chain, getStoragePath builder, and
 * convenience exports. Uses jest.isolateModules to re-evaluate the
 * module-level IIFE with different env/fs conditions.
 */

jest.mock("server-only", () => ({}));

describe("storage", () => {
  const originalDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (originalDataDir !== undefined) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }
  });

  function importStorageFresh(): typeof import("@/lib/storage") {
    let mod: typeof import("@/lib/storage");
    jest.isolateModules(() => {
      mod = require("@/lib/storage");
    });
    return mod!;
  }

  describe("DATA_DIR fallback chain", () => {
    it("uses DATA_DIR env var when set (highest priority)", () => {
      process.env.DATA_DIR = "/custom/storage";
      const { getDataDir } = importStorageFresh();
      expect(getDataDir()).toBe("/custom/storage");
    });

    it("resolves DATA_DIR to absolute path", () => {
      process.env.DATA_DIR = "./relative/path";
      const { getDataDir } = importStorageFresh();
      const result = getDataDir();
      expect(result).not.toBe("./relative/path");
      expect(result).toMatch(/\/relative\/path$/);
    });

    it("falls back to ./data when DATA_DIR unset and /data unavailable", () => {
      delete process.env.DATA_DIR;
      // statSync("/data") will throw (not in Docker) → falls back to ./data
      const { getDataDir } = importStorageFresh();
      const result = getDataDir();
      expect(result).toMatch(/\/data$/);
    });
  });

  describe("getStoragePath", () => {
    it("joins segments onto base directory", () => {
      process.env.DATA_DIR = "/test/data";
      const { getStoragePath } = importStorageFresh();
      expect(getStoragePath("logos")).toBe("/test/data/logos");
    });

    it("joins multiple segments", () => {
      process.env.DATA_DIR = "/test/data";
      const { getStoragePath } = importStorageFresh();
      expect(getStoragePath("files", "resumes")).toBe("/test/data/files/resumes");
    });

    it("returns base dir when called with no segments", () => {
      process.env.DATA_DIR = "/test/data";
      const { getStoragePath } = importStorageFresh();
      expect(getStoragePath()).toBe("/test/data");
    });
  });

  describe("convenience exports", () => {
    it("getLogosDir returns {dataDir}/logos", () => {
      process.env.DATA_DIR = "/test/data";
      const { getLogosDir } = importStorageFresh();
      expect(getLogosDir()).toBe("/test/data/logos");
    });

    it("getAuditArchiveDir returns {dataDir}/audit-archive", () => {
      process.env.DATA_DIR = "/test/data";
      const { getAuditArchiveDir } = importStorageFresh();
      expect(getAuditArchiveDir()).toBe("/test/data/audit-archive");
    });

    it("getResumesDir returns {dataDir}/files/resumes", () => {
      process.env.DATA_DIR = "/test/data";
      const { getResumesDir } = importStorageFresh();
      expect(getResumesDir()).toBe("/test/data/files/resumes");
    });
  });
});
