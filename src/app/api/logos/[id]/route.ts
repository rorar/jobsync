import "server-only";

export const dynamic = "force-dynamic";

/**
 * GET /api/logos/[id] — Serve a cached logo asset.
 *
 * Auth: session-based (must be logo owner)
 * Headers: Cache-Control, ETag, Content-Type, Content-Disposition
 * SVGs: additional Content-Security-Policy sandbox
 * 304: If-None-Match support
 *
 * Security: userId in all queries (ADR-015), filePath never from user input.
 */

import { auth } from "@/auth";
import prisma from "@/lib/db";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/** Safety limit: refuse to serve files larger than 2MB (prevents memory exhaustion) */
const MAX_SERVE_BYTES = 2 * 1024 * 1024;

/** UUID v4 validation pattern */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // UUID validation
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Find asset (IDOR: userId in query)
    const asset = await prisma.logoAsset.findFirst({
      where: {
        id,
        userId: session.user.id,
        status: "ready",
      },
      select: {
        filePath: true,
        mimeType: true,
        fileSize: true,
        updatedAt: true,
      },
    });

    if (!asset) {
      // M-S-03: Uniform 404 for both "not owned" and "not found" cases.
      // Do NOT distinguish them in the HTTP response — that would be an
      // ownership enumeration oracle (attacker learns whether the ID is
      // valid by observing a different message/code). Both cases return
      // the same opaque 404.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Generate ETag from file path + updatedAt
    const etagSource = `${asset.filePath}:${asset.updatedAt.getTime()}`;
    const etag = `"${crypto.createHash("md5").update(etagSource).digest("hex")}"`;

    // 304 Not Modified — If-None-Match support
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }

    // Verify file exists and check size before reading into memory.
    // M-S-03: On disk-miss we return the SAME 404 as the ownership check
    // above (uniform "Not found" body). The disk-miss detail is logged
    // server-side only — never surfaced in the HTTP response.
    let fileBuffer: Buffer;
    try {
      const fileStat = await fs.stat(asset.filePath);
      if (!fileStat.isFile() || fileStat.size > MAX_SERVE_BYTES) {
        // Log internally so ops can detect stale DB records vs missing files.
        console.warn(`[LogoRoute] Asset ${id} record exists but file missing or oversized: ${asset.filePath}`);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      fileBuffer = await fs.readFile(asset.filePath);
    } catch {
      // Log internally; return opaque 404 to caller.
      console.warn(`[LogoRoute] Asset ${id} file unreadable: ${asset.filePath}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build response headers
    const headers: Record<string, string> = {
      "Content-Type": asset.mimeType,
      "Content-Length": String(fileBuffer.length),
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400, immutable",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };

    // SVGs: add Content-Security-Policy sandbox (defense-in-depth against XSS)
    if (asset.mimeType === "image/svg+xml") {
      headers["Content-Security-Policy"] =
        "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[LogoRoute] Error serving logo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
