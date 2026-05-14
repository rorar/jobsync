/**
 * Orphan Finder Tests
 *
 * Tests: purgeOrphanedFiles() — generic recursive orphan file purger.
 * Uses real filesystem (tmpdir) — no mocking needed.
 */

jest.mock("server-only", () => ({}));

import { purgeOrphanedFiles } from "@/lib/assets/orphan-finder";
import { mkdirSync, writeFileSync, existsSync, utimesSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("purgeOrphanedFiles", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "orphan-test-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  // Helper: create a file with an old mtime (past the grace period)
  function createOldFile(filePath: string, daysOld: number): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, "test");
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysOld);
    utimesSync(filePath, pastDate, pastDate);
  }

  // Helper: create a file with current mtime (within grace period)
  function createRecentFile(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, "test");
  }

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it("deletes orphaned files older than grace period", async () => {
    const orphanPath = join(baseDir, "user1", "company1", "logo.png");
    createOldFile(orphanPath, 10);

    const result = await purgeOrphanedFiles(
      baseDir,
      () => false, // nothing is known
      7, // 7 day grace
      2, // prune 2 parent levels
    );

    expect(result.deletedCount).toBe(1);
    expect(existsSync(orphanPath)).toBe(false);
  });

  it("deletes multiple orphans across nested directories", async () => {
    createOldFile(join(baseDir, "u1", "c1", "logo.png"), 15);
    createOldFile(join(baseDir, "u1", "c2", "logo.jpg"), 15);
    createOldFile(join(baseDir, "u2", "c3", "logo.svg"), 15);

    const result = await purgeOrphanedFiles(baseDir, () => false, 7, 2);

    expect(result.deletedCount).toBe(3);
  });

  // -----------------------------------------------------------------------
  // ENOENT handling
  // -----------------------------------------------------------------------

  it("returns 0 when baseDir does not exist", async () => {
    const result = await purgeOrphanedFiles(
      "/tmp/nonexistent-dir-xyz-12345",
      () => false,
      7,
      2,
    );

    expect(result.deletedCount).toBe(0);
  });

  it("returns 0 for empty directory", async () => {
    const result = await purgeOrphanedFiles(baseDir, () => false, 7, 0);

    expect(result.deletedCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Grace period
  // -----------------------------------------------------------------------

  it("skips files within the grace period", async () => {
    const recentPath = join(baseDir, "user1", "company1", "logo.png");
    createRecentFile(recentPath);

    const result = await purgeOrphanedFiles(baseDir, () => false, 7, 2);

    expect(result.deletedCount).toBe(0);
    expect(existsSync(recentPath)).toBe(true);
  });

  it("respects grace period boundary — old file deleted, recent kept", async () => {
    const oldPath = join(baseDir, "user1", "c1", "old.png");
    const recentPath = join(baseDir, "user1", "c2", "recent.png");
    createOldFile(oldPath, 10);
    createRecentFile(recentPath);

    const result = await purgeOrphanedFiles(baseDir, () => false, 7, 2);

    expect(result.deletedCount).toBe(1);
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(recentPath)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Known files (isKnown predicate)
  // -----------------------------------------------------------------------

  it("skips files that are known (tracked in DB)", async () => {
    const knownPath = join(baseDir, "user1", "company1", "logo.png");
    createOldFile(knownPath, 30);

    const knownSet = new Set([knownPath]);
    const result = await purgeOrphanedFiles(
      baseDir,
      (p) => knownSet.has(p),
      7,
      2,
    );

    expect(result.deletedCount).toBe(0);
    expect(existsSync(knownPath)).toBe(true);
  });

  it("deletes unknown files but keeps known ones", async () => {
    const knownPath = join(baseDir, "u1", "c1", "logo.png");
    const orphanPath = join(baseDir, "u1", "c2", "stale.png");
    createOldFile(knownPath, 30);
    createOldFile(orphanPath, 30);

    const knownSet = new Set([knownPath]);
    const result = await purgeOrphanedFiles(
      baseDir,
      (p) => knownSet.has(p),
      7,
      2,
    );

    expect(result.deletedCount).toBe(1);
    expect(existsSync(knownPath)).toBe(true);
    expect(existsSync(orphanPath)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Directory entries are skipped
  // -----------------------------------------------------------------------

  it("does not count directories as orphans", async () => {
    // Create a directory structure with no files
    mkdirSync(join(baseDir, "user1", "company1"), { recursive: true });
    mkdirSync(join(baseDir, "user2"), { recursive: true });

    const result = await purgeOrphanedFiles(baseDir, () => false, 0, 0);

    expect(result.deletedCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Flat directory (pruneLevels = 0)
  // -----------------------------------------------------------------------

  it("works with flat directory structure (no nesting, pruneLevels=0)", async () => {
    const filePath = join(baseDir, "orphan.txt");
    writeFileSync(filePath, "test");
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    utimesSync(filePath, pastDate, pastDate);

    const result = await purgeOrphanedFiles(baseDir, () => false, 7, 0);

    expect(result.deletedCount).toBe(1);
    expect(existsSync(filePath)).toBe(false);
  });
});
