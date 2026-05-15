/**
 * Tests for src/lib/upload.ts — uploadFile path traversal guards (T-4).
 *
 * Verifies that the path validation rejects traversal attacks while
 * allowing legitimate uploads within DATA_DIR.
 */

import path from "path";

// Mock getDataDir to return a known base path
const MOCK_DATA_DIR = "/mock/data";
jest.mock("@/lib/storage", () => ({
  getDataDir: () => MOCK_DATA_DIR,
}));

// Mock fs built-in (upload.ts uses fs.existsSync, fs.mkdirSync, fs.promises.writeFile)
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
}));

import { uploadFile } from "@/lib/upload";
import fs from "fs";

// Minimal File mock
function makeFile(content: string = "test"): File {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(content);
  return {
    arrayBuffer: () => Promise.resolve(buffer.buffer),
    name: "test.pdf",
    size: buffer.byteLength,
  } as unknown as File;
}

describe("uploadFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  it("rejects dir with path traversal (../)", async () => {
    const file = makeFile();
    await expect(
      uploadFile(file, "/mock/data/../etc", "/mock/data/../etc/passwd"),
    ).rejects.toThrow("Invalid upload path");
  });

  it("rejects filePath that escapes the dir", async () => {
    const file = makeFile();
    const dir = path.join(MOCK_DATA_DIR, "files", "resumes");
    const filePath = path.join(MOCK_DATA_DIR, "files", "resumes", "..", "..", "etc", "passwd");

    await expect(uploadFile(file, dir, filePath)).rejects.toThrow("Invalid upload path");
  });

  it("rejects dir completely outside DATA_DIR", async () => {
    const file = makeFile();
    await expect(uploadFile(file, "/etc", "/etc/passwd")).rejects.toThrow("Invalid upload path");
  });

  it("rejects filePath outside dir even when dir is valid", async () => {
    const file = makeFile();
    const dir = path.join(MOCK_DATA_DIR, "files");
    const filePath = path.join(MOCK_DATA_DIR, "other", "file.pdf");

    await expect(uploadFile(file, dir, filePath)).rejects.toThrow("Invalid upload path");
  });

  it("allows valid path within DATA_DIR", async () => {
    const file = makeFile();
    const dir = path.join(MOCK_DATA_DIR, "files", "resumes");
    const filePath = path.join(dir, "resume.pdf");

    await expect(uploadFile(file, dir, filePath)).resolves.toBeUndefined();
  });

  it("calls writeFile with buffer for valid upload", async () => {
    const file = makeFile("hello");
    const dir = path.join(MOCK_DATA_DIR, "files", "resumes");
    const filePath = path.join(dir, "resume.pdf");

    await uploadFile(file, dir, filePath);

    expect(mockWriteFile).toHaveBeenCalledWith(filePath, expect.any(Uint8Array));
  });

  it("creates directory if it does not exist", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const file = makeFile();
    const dir = path.join(MOCK_DATA_DIR, "files", "resumes");
    const filePath = path.join(dir, "resume.pdf");

    await uploadFile(file, dir, filePath);

    expect(fs.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
  });
});
