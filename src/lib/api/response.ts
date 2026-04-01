import { NextResponse } from "next/server";
import type { ActionResult } from "@/models/actionResult";

/**
 * Standard JSON envelope for the Public API.
 *
 * Success: { success: true, data: T, meta?: PaginationMeta }
 * Error:   { success: false, error: { code: string, message: string } }
 */

interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Translate an ActionResult from a server action into a NextResponse
 * with the correct HTTP status code.
 */
export function actionToResponse<T>(
  result: ActionResult<T>,
  options?: { status?: number },
): NextResponse {
  if (result.success) {
    const body: Record<string, unknown> = {
      success: true,
      data: result.data,
    };
    if (result.total !== undefined) {
      body.total = result.total;
    }
    return NextResponse.json(body, { status: options?.status ?? 200 });
  }

  // Map common error messages to HTTP status codes
  const rawMessage = result.message ?? "An error occurred";
  const status = inferErrorStatus(rawMessage);

  // Sanitize error message for external consumers (SEC-18).
  // Only forward known safe messages; replace internal errors with generic text.
  const message = status === 500
    ? "An unexpected error occurred."
    : rawMessage;

  return NextResponse.json(
    {
      success: false,
      error: {
        code: statusToCode(status),
        message,
      },
    },
    { status },
  );
}

/**
 * Build a paginated success response with meta information.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): NextResponse {
  const meta: PaginationMeta = {
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };

  return NextResponse.json({
    success: true,
    data,
    meta,
  });
}

/**
 * Build a standardized error response.
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status },
  );
}

/**
 * Success response for resource creation (201 Created).
 */
export function createdResponse<T>(data: T): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status: 201 },
  );
}

/**
 * Success response with no content (204).
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// --- Internal helpers ---

function inferErrorStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated") || lower.includes("not authorized")) {
    return 401;
  }
  if (lower.includes("not found")) {
    return 404;
  }
  if (lower.includes("validation") || lower.includes("invalid") || lower.includes("provide")) {
    return 400;
  }
  if (lower.includes("already exists") || lower.includes("duplicate")) {
    return 409;
  }
  return 500;
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}
