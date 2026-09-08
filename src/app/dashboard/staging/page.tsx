import StagingContainer from "@/components/staging/StagingContainer";
import { getUserLocale, t } from "@/i18n/server";

export default async function StagingPage() {
  const locale = await getUserLocale();
  return (
    <div className="col-span-3 py-6 px-4">
      <h1 className="sr-only">{t(locale, "nav.stagingQueue")}</h1>
      <StagingContainer />
    </div>
  );
}
