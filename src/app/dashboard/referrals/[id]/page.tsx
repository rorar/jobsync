import ReferralWorkspaceClient from "./ReferralWorkspaceClient";

export default async function ReferralWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReferralWorkspaceClient referralId={id} />;
}
