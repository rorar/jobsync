import { getResumeList } from "@/actions/profile.actions";
import { AutomationContainer } from "@/components/automations/AutomationContainer";
import { getUserLocale, t } from "@/i18n/server";

export default async function AutomationsPage() {
  const [resumeResult, locale] = await Promise.all([
    getResumeList(1, 100),
    getUserLocale(),
  ]);
  const resumes =
    (resumeResult?.data as any[])?.map((r: { id: string; title: string }) => ({
      id: r.id,
      title: r.title,
    })) || [];

  return (
    <div className="col-span-3 py-6">
      <h1 className="sr-only">{t(locale, "nav.automations")}</h1>
      <AutomationContainer resumes={resumes} />
    </div>
  );
}
