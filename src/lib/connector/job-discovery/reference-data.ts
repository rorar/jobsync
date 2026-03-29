import db from "@/lib/db";
import { normalizeForSearch, extractKeywords, extractCityName } from "./utils";

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
    return existing.id;
  }

  const newLocation = await db.location.create({
    data: {
      label: location,
      value: normalized,
      createdBy: userId,
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

export async function getDefaultJobStatus(): Promise<string> {
  let status = await db.jobStatus.findFirst({ where: { value: "new" } });

  if (!status) {
    status = await db.jobStatus.create({
      data: { label: "New", value: "new" },
    });
  }

  return status.id;
}
