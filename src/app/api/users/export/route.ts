import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { collectUserData } from "@/lib/export/collect-user-data";
import { buildExportMetadata } from "@/lib/export/export-metadata";
import { checkExportRateLimit } from "@/lib/export-rate-limit";
import { formatISODate } from "@/i18n";

export const GET = async () => {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  // Rate limit: 1 export per hour
  const rateLimitResult = checkExportRateLimit(userId);
  if (!rateLimitResult.allowed) {
    const retryAfterSec = Math.ceil((rateLimitResult.retryAfterMs ?? 0) / 1000);
    return NextResponse.json(
      { error: "Rate limited", retryAfterSeconds: retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  const passThrough = new PassThrough();

  // Stream ZIP creation in background
  (async () => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(passThrough);

    try {
      // Collect all user data
      const data = await collectUserData(userId);

      // Add metadata.json (GDPR Art. 15 mandated)
      const metadata = buildExportMetadata(userEmail);
      archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

      // Add each aggregate as a separate JSON file
      for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) continue;
        archive.append(JSON.stringify(value, null, 2), { name: `${key}.json` });
      }

      await archive.finalize();
    } catch (error) {
      console.error("[export] Error creating ZIP:", error);
      archive.abort();
      // Destroy stream with error so client gets a broken download, not a corrupt ZIP
      passThrough.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  const webStream = Readable.toWeb(passThrough) as ReadableStream;
  const filename = `jobsync-export-${formatISODate(new Date())}.zip`;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
