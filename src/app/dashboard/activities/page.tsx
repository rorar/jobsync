import ActivitiesContainer from "@/components/activities/ActivitiesContainer";
import { getUserLocale, t } from "@/i18n/server";
import React from "react";

async function Activities() {
  const locale = await getUserLocale();
  return (
    <div className="col-span-3">
      <h1 className="sr-only">{t(locale, "nav.activities")}</h1>
      <ActivitiesContainer />
    </div>
  );
}

export default Activities;
