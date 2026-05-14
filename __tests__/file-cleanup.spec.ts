/**
 * File Cleanup Tests
 *
 * Tests: deleteFileAndPruneEmptyParents() — idempotent file deletion
 * with upward empty directory pruning.
 * Uses real filesystem (tmpdir).
 */

jest.mock("server-only", () => ({}));

import { deleteFileAndPruneEmptyParents } from "@/lib/assets/file-cleanup";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("deleteFileAndPruneEmptyParents", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "file-cleanup-test-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function createFile(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, "test-content");
  }

  // -----------------------------------------------------------------------
  // Basic deletion
  // -----------------------------------------------------------------------

  it("deletes a file (levels=0, no pruning)", async () => {
    const filePath = join(baseDir, "a", "b", "file.txt");
    createFile(filePath);

    await deleteFileAndPruneEmptyParents(filePath, 0);

    expect(existsSync(filePath)).toBe(false);
    // Parent dirs still exist
    expect(existsSync(join(baseDir, "a", "b"))).toBe(true);
    expect(existsSync(join(baseDir, "a"))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // ENOENT idempotency
  // -----------------------------------------------------------------------

  it("is idempotent — ENOENT on file is success", async () => {
    const filePath = join(baseDir, "nonexistent.txt");

    // Should NOT throw
    await expect(
      deleteFileAndPruneEmptyParents(filePath, 2),
    ).resolves.toBeUndefined();
  });

  it("does not prune parents when file does not exist", async () => {
    // Create parent dirs but no file
    const parentDir = join(baseDir, "a", "b");
    mkdirSync(parentDir, { recursive: true });

    await deleteFileAndPruneEmptyParents(join(parentDir, "missing.txt"), 2);

    // Parents should still exist (we never deleted a file)
    expect(existsSync(parentDir)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Parent directory pruning
  // -----------------------------------------------------------------------

  it("prunes 2 empty parent levels after deletion", async () => {
    const filePath = join(baseDir, "user1", "company1", "logo.png");
    createFile(filePath);

    await deleteFileAndPruneEmptyParents(filePath, 2);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(join(baseDir, "user1", "company1"))).toBe(false);
    expect(existsSync(join(baseDir, "user1"))).toBe(false);
    // baseDir still exists
    expect(existsSync(baseDir)).toBe(true);
  });

  it("prunes only 1 level when levels=1", async () => {
    const filePath = join(baseDir, "user1", "company1", "logo.png");
    createFile(filePath);

    await deleteFileAndPruneEmptyParents(filePath, 1);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(join(baseDir, "user1", "company1"))).toBe(false);
    // user1 dir still exists
    expect(existsSync(join(baseDir, "user1"))).toBe(true);
  });

  it("stops pruning when a parent directory is not empty", async () => {
    // Create two files in sibling company dirs
    const file1 = join(baseDir, "user1", "company1", "logo.png");
    const file2 = join(baseDir, "user1", "company2", "logo.png");
    createFile(file1);
    createFile(file2);

    // Delete only file1
    await deleteFileAndPruneEmptyParents(file1, 2);

    expect(existsSync(file1)).toBe(false);
    expect(existsSync(join(baseDir, "user1", "company1"))).toBe(false);
    // user1 still exists because company2 is still there
    expect(existsSync(join(baseDir, "user1"))).toBe(true);
    expect(existsSync(file2)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // levels > actual depth
  // -----------------------------------------------------------------------

  it("handles levels greater than actual directory depth gracefully", async () => {
    const filePath = join(baseDir, "file.txt");
    createFile(filePath);

    // levels=5 but only 1 level of nesting — should stop at baseDir's parent
    await expect(
      deleteFileAndPruneEmptyParents(filePath, 5),
    ).resolves.toBeUndefined();

    expect(existsSync(filePath)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Non-ENOENT errors
  // -----------------------------------------------------------------------

  it("rethrows non-ENOENT errors on unlink", async () => {
    // Use a directory path instead of a file — unlink on a directory throws EPERM/EISDIR
    const dirPath = join(baseDir, "a-dir");
    mkdirSync(dirPath);

    await expect(
      deleteFileAndPruneEmptyParents(dirPath, 0),
    ).rejects.toThrow();
  });
});
