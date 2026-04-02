import type { JobStatus } from "@/models/job.model";

/**
 * Returns the translated status label, falling back to the database label.
 */
export function getStatusLabel(
  t: (key: string) => string,
  status: JobStatus | null,
): string {
  if (!status) return "";
  const key = `jobs.status${status.value.charAt(0).toUpperCase()}${status.value.slice(1)}`;
  const translated = t(key as any);
  return translated !== key ? translated : status.label;
}
