/**
 * BS-01 Regression — deleteFile IDOR (ADR-019 Pattern A)
 *
 * Guards the security invariant that `deleteFile` (now a server-only leaf,
 * NOT a "use server" export) enforces ownership via File → Resume → Profile → User
 * on EVERY call. A File owned by another user must be a no-op: neither the DB row
 * nor the on-disk file may be touched.
 *
 * Pre-fix bugs this reproduces:
 *  - `callerUserId?` optional → where fell back to `{ id: fileId }` (cross-user delete)
 *  - `prisma.file.delete({ where: { id: fileId } })` ran even without ownership match
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    file: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("fs", () => ({
  __esModule: true,
  default: { existsSync: jest.fn(), unlinkSync: jest.fn() },
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import db from "@/lib/db";
import fs from "fs";
import { deleteFile } from "@/lib/profile/delete-file";

const mockFile = db.file as unknown as {
  findFirst: jest.Mock;
  delete: jest.Mock;
};
const mockFs = fs as unknown as {
  existsSync: jest.Mock;
  unlinkSync: jest.Mock;
};

const OWNER = "owner-user-id";
const ATTACKER = "attacker-user-id";
const FILE_ID = "file-123";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("deleteFile — ownership enforcement (BS-01)", () => {
  it("always scopes the lookup by File → Resume → Profile → userId", async () => {
    mockFile.findFirst.mockResolvedValue(null);

    await deleteFile(FILE_ID, OWNER);

    expect(mockFile.findFirst).toHaveBeenCalledWith({
      where: { id: FILE_ID, Resume: { profile: { userId: OWNER } } },
    });
  });

  it("is a no-op when the file belongs to another user (IDOR blocked)", async () => {
    // Ownership-scoped query returns null because attacker is not the owner.
    mockFile.findFirst.mockResolvedValue(null);
    mockFs.existsSync.mockReturnValue(true);

    await deleteFile(FILE_ID, ATTACKER);

    expect(mockFile.delete).not.toHaveBeenCalled();
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  it("deletes row + on-disk file for the owner", async () => {
    mockFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      filePath: "/data/files/resumes/owner.pdf",
    });
    mockFs.existsSync.mockReturnValue(true);
    mockFile.delete.mockResolvedValue({});

    await deleteFile(FILE_ID, OWNER);

    expect(mockFs.unlinkSync).toHaveBeenCalledWith(
      "/data/files/resumes/owner.pdf"
    );
    expect(mockFile.delete).toHaveBeenCalledWith({ where: { id: FILE_ID } });
  });

  it("still removes the DB row when the on-disk file is already gone (no throw)", async () => {
    mockFile.findFirst.mockResolvedValue({
      id: FILE_ID,
      filePath: "/data/files/resumes/missing.pdf",
    });
    mockFs.existsSync.mockReturnValue(false);
    mockFile.delete.mockResolvedValue({});

    await deleteFile(FILE_ID, OWNER);

    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    expect(mockFile.delete).toHaveBeenCalledWith({ where: { id: FILE_ID } });
  });
});
