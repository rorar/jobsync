import AdminTabsContainer from "@/components/admin/AdminTabsContainer";
import { getUserLocale, t } from "@/i18n/server";

async function AdminPage() {
  const locale = await getUserLocale();
  return (
    <div className="flex flex-col col-span-3">
      {/*
        h1, not h3: CardTitle renders an h3 (src/components/ui/card.tsx:36), so
        an h3 here made the page title a sibling of the cards it contains. The
        classes are the ones it already had, so nothing moves visually.
      */}
      <h1 className="text-2xl font-semibold leading-none tracking-tight mb-4">
        {t(locale, "nav.administration")}
      </h1>
      <AdminTabsContainer />
    </div>
  );
}

export default AdminPage;
