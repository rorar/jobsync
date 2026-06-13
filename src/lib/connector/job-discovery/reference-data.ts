import db from "@/lib/db";
import { normalizeForSearch, extractKeywords, extractCityName } from "./utils";
import { getDefaultJobStatusForUser } from "@/lib/crm/seed-job-statuses";

export async function findOrCreateJobTitle(
  title: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(title);

  let existing = await db.jobTitle.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const keywords = extractKeywords(title);
    if (keywords.length > 0) {
      existing = await db.jobTitle.findFirst({
        where: {
          createdBy: userId,
          OR: keywords.map((keyword) => ({
            value: { contains: keyword },
          })),
        },
      });
    }
  }

  if (existing) {
    return existing.id;
  }

  const newTitle = await db.jobTitle.create({
    data: {
      label: title,
      value: normalized,
      createdBy: userId,
    },
  });
  return newTitle.id;
}

export async function findOrCreateLocation(
  location: string,
  userId: string,
  countryCode?: string,
): Promise<string | null> {
  if (!location) return null;

  const normalized = normalizeForSearch(location);
  const cityName = extractCityName(location);

  let existing = await db.location.findFirst({
    where: {
      value: normalized,
      createdBy: userId,
    },
  });

  if (!existing && cityName) {
    existing = await db.location.findFirst({
      where: {
        createdBy: userId,
        OR: [
          { value: { contains: cityName } },
          { label: { contains: cityName } },
        ],
      },
    });
  }

  if (existing) {
    // Backfill: if existing Location has no country but we have countryCode, update it
    if (countryCode && !existing.country) {
      try {
        await db.location.update({
          where: { id: existing.id },
          data: { country: countryCode.toUpperCase() },
        });
      } catch {
        // Best-effort backfill — race condition is harmless
      }
    }
    return existing.id;
  }

  const newLocation = await db.location.create({
    data: {
      label: location,
      value: normalized,
      createdBy: userId,
      country: countryCode?.toUpperCase() ?? null,
    },
  });
  return newLocation.id;
}

export async function findOrCreateCompany(
  company: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(company);

  let existing = await db.company.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const companyKeywords = extractKeywords(company);
    if (companyKeywords.length > 0) {
      existing = await db.company.findFirst({
        where: {
          createdBy: userId,
          OR: companyKeywords.map((keyword) => ({
            label: { contains: keyword },
          })),
        },
      });
    }
  }

  if (existing) {
    return existing.id;
  }

  const newCompany = await db.company.create({
    data: {
      label: company,
      value: normalized,
      createdBy: userId,
    },
  });
  return newCompany.id;
}

export async function getOrCreateJobSource(
  sourceBoard: string,
  userId: string,
): Promise<string> {
  const normalized = sourceBoard.toLowerCase();

  let jobSource = await db.jobSource.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!jobSource) {
    jobSource = await db.jobSource.create({
      data: {
        label: sourceBoard.charAt(0).toUpperCase() + sourceBoard.slice(1),
        value: normalized,
        createdBy: userId,
      },
    });
  }

  return jobSource.id;
}

/**
 * Resolve the default JobStatus id for a user (Welle 4: per-user statuses).
 * userId-scoped (ADR-015) — never touches another user's statuses, never creates
 * a global row. Seeds the user's set on first use if absent.
 */
export async function getDefaultJobStatus(userId: string): Promise<string> {
  const status = await getDefaultJobStatusForUser(db, userId);
  return status.id;
}
