"use client";

import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";

/**
 * Sum-type discriminator badge (insider_relay | network_path).
 * SoT: specs/inside-track.allium `kind`. Label always present (i18n);
 * `data-kind` is a styling/test hook.
 */
export function ReferralKindBadge({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const { t } = useTranslations();
  return (
    <Badge variant="secondary" data-kind={kind} className={className}>
      {t(`insideTrack.kind.${kind}`)}
    </Badge>
  );
}
