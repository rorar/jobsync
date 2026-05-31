import "server-only";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import fs from "fs";

/**
 * Delete a resume File after verifying ownership via the
 * File → Resume → Profile → User chain.
 *
 * ADR-019 Pattern A: this lives in a `server-only` leaf (NOT a "use server"
 * file) so it is never exposed as a browser-callable Server Action. `callerUserId`
 * is REQUIRED and the ownership where-clause is ALWAYS enforced — a File that does
 * not belong to the caller (or does not exist) is a silent no-op: no filesystem
 * unlink, no DB delete. Prevents the BS-01 IDOR.
 *
 * @returns `undefined` on success/no-op, or an error ActionResult on failure.
 */
export const deleteFile = async (fileId: string, callerUserId: string) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: fileId, Resume: { profile: { userId: callerUserId } } },
    });

    // Not owned by caller (or missing) → no-op. Never delete by id alone.
    if (!file) {
      return;
    }

    if (file.filePath && fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    await prisma.file.delete({ where: { id: fileId } });
  } catch (error) {
    return handleError(error, "profile.deleteError");
  }
};
