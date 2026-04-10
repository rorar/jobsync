import { auth } from "@/auth";
import { NextResponse } from "next/server";

const EURES_API_BASE = "https://europa.eu/eures/api";
const LANGUAGES_URL = `${EURES_API_BASE}/shared-data-rest-api/public/reference/languages`;

/**
 * EURES reference language list.
 *
 * Matches the `Language` schema from the EURES OpenAPI spec
 * (see `src/lib/connector/job-discovery/modules/eures/generated.ts`):
 *   { id: number; isoCode: string; label: string }
 *
 * The `label` field contains the language name in its native script
 * (e.g., "Deutsch", "English", "français").
 */
export interface EuresLanguage {
  id: number;
  isoCode: string;
  label: string;
}

export async function GET(): Promise<NextResponse<EuresLanguage[] | { error: string }>> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const response = await fetch(LANGUAGES_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 }, // cache for 24h — language list is static
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `EURES API returned ${response.status}` },
        { status: 502 },
      );
    }

    const data: EuresLanguage[] = await response.json();

    // Sort alphabetically by native label for consistent dropdown ordering.
    data.sort((a, b) => a.label.localeCompare(b.label));

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[eures/languages] Failed to fetch:", error);
    return NextResponse.json(
      { error: "Failed to fetch EURES language list" },
      { status: 502 },
    );
  }
}
