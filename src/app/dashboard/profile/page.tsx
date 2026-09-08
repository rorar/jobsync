import ProfileContainer from "@/components/profile/ProfileContainer";
import { getUserLocale, t } from "@/i18n/server";
import React from "react";

async function Profile() {
  const locale = await getUserLocale();
  return (
    <div className="col-span-3">
      <h1 className="sr-only">{t(locale, "nav.profile")}</h1>
      <ProfileContainer />
    </div>
  );
}

export default Profile;
