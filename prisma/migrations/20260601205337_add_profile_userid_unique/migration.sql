-- Profile.userId @unique (full-review Arch H2): one Profile per user, enabling
-- atomic upsert in createResumeProfile / updateProfilePreferences and preventing
-- the split-brain a concurrent find-then-create race could fork.
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
