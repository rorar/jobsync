import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  isValidTokenFormat,
  hashDeletionToken,
} from "@/lib/account/deletion-token";
import { getPrivacySettingsForUser } from "@/lib/account/privacy-helpers";
import { executeAccountDeletion } from "@/lib/account/execute-deletion";

/**
 * GET /api/account/confirm-deletion?token=del_...
 *
 * Email confirmation endpoint for account deletion (F-2).
 * No session required — the token IS the auth.
 * Single-use: token is deleted on successful confirmation.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");

  // Validate token format
  if (!token || !isValidTokenFormat(token)) {
    return htmlResponse(
      "Invalid Link",
      "The deletion confirmation link is invalid. Please request a new one from your account settings.",
      "error",
    );
  }

  // Hash and look up in DB
  const tokenHash = hashDeletionToken(token);
  const record = await prisma.deletionConfirmationToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    return htmlResponse(
      "Link Expired or Used",
      "This deletion confirmation link has already been used or has expired. Please request a new one from your account settings.",
      "error",
    );
  }

  // Check expiry
  if (record.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.deletionConfirmationToken.delete({
      where: { id: record.id },
    });
    return htmlResponse(
      "Link Expired",
      "This deletion confirmation link has expired. Please request a new one from your account settings.",
      "error",
    );
  }

  const userId = record.userId;
  const privacy = await getPrivacySettingsForUser(userId);

  // F-4: Cooling-off period
  if (privacy.coolingOffDays > 0) {
    const scheduledAt = new Date(
      Date.now() + privacy.coolingOffDays * 24 * 60 * 60 * 1000,
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { deletionScheduledAt: scheduledAt },
      }),
      prisma.deletionConfirmationToken.delete({
        where: { id: record.id },
      }),
    ]);

    const formattedDate = scheduledAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return htmlResponse(
      "Deletion Scheduled",
      `Your account deletion has been confirmed and scheduled for <strong>${formattedDate}</strong>. ` +
        "You can cancel the deletion from your account settings before this date.",
      "scheduled",
    );
  }

  // Immediate deletion
  try {
    await prisma.deletionConfirmationToken.delete({
      where: { id: record.id },
    });
    await executeAccountDeletion(userId);
  } catch (error) {
    console.error(
      "[confirm-deletion] Failed to execute account deletion:",
      error,
    );
    return htmlResponse(
      "Deletion Failed",
      "An error occurred while deleting your account. Please try again or contact support.",
      "error",
    );
  }

  return htmlResponse(
    "Account Deleted",
    "Your account and all associated data have been permanently deleted. You can close this page.",
    "success",
  );
}

// ---------------------------------------------------------------------------
// HTML Response Helper
// ---------------------------------------------------------------------------

function htmlResponse(
  title: string,
  message: string,
  status: "success" | "error" | "scheduled",
): NextResponse {
  const statusColor =
    status === "success"
      ? "#16a34a"
      : status === "scheduled"
        ? "#d97706"
        : "#dc2626";

  const statusIcon =
    status === "success" ? "&#10003;" : status === "scheduled" ? "&#9200;" : "&#10007;";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - JobSync</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
      max-width: 480px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background-color: #18181b;
      padding: 20px 24px;
      color: #fff;
      font-size: 18px;
      font-weight: 600;
    }
    .body {
      padding: 32px 24px;
      text-align: center;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background-color: ${statusColor}15;
      color: ${statusColor};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      color: #18181b;
      margin-bottom: 8px;
    }
    .message {
      font-size: 14px;
      color: #52525b;
      line-height: 1.6;
    }
    .footer {
      padding: 16px 24px;
      border-top: 1px solid #e4e4e7;
      background-color: #fafafa;
      text-align: center;
    }
    .footer p {
      color: #a1a1aa;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">JobSync</div>
    <div class="body">
      <div class="icon">${statusIcon}</div>
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="message">${message}</p>
    </div>
    <div class="footer">
      <p>JobSync Account Management</p>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
