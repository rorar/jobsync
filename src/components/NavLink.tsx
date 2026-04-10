import React, { ForwardRefExoticComponent, RefAttributes } from "react";
import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavLinkProps {
  label: string;
  Icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  route: string;
  pathname: string;
}

function NavLink({ label, Icon, route, pathname }: NavLinkProps) {
  /*
   * Sprint 3 Stream G — Sprint 2 follow-up (architecture typo fix).
   *
   * The previous detection used `pathname.startsWith(\`${route}/dashboard\`)`,
   * which was a historical typo. Every `SIDEBAR_LINKS` entry's `route`
   * already starts with `/dashboard/...` (e.g. `/dashboard/automations`),
   * so the old suffix `/dashboard` could never match — `.startsWith(
   * "/dashboard/automations/dashboard")` is a path that does not exist
   * in the app. The practical effect was that every sidebar item only
   * lit up on its EXACT route, and any sub-route (e.g.
   * `/dashboard/myjobs/abc123`) left the sidebar with no active item
   * until the user navigated back up.
   *
   * The correct rule is:
   *   (a) exact equality: the nav item is active on its own page, AND
   *   (b) direct prefix + "/": the nav item stays active on any sub-route
   *       rooted under it (`/dashboard/myjobs/abc` lights up "My Jobs").
   *
   * The `startsWith(\`${route}/\`)` check intentionally keeps the
   * trailing slash to avoid accidental partial matches — without it
   * `/dashboard/tasks-archive` would light up `/dashboard/tasks`, which
   * is a false positive. This also transparently fixes the root
   * `/dashboard` entry: because the "Dashboard" sidebar item's route is
   * `/dashboard` and no other sidebar route ends with `/dashboard`, the
   * item highlights only when pathname is exactly `/dashboard` — we do
   * NOT want it to also highlight on every subpage, or every item
   * under the `/dashboard/*` tree would show two active entries.
   * Therefore the `startsWith(\`${route}/\`)` branch is guarded by a
   * length check: we only follow it when `route` itself has a
   * descendant segment (i.e. `route !== "/dashboard"`). This preserves
   * the single-active-item invariant the UI relies on.
   */
  const isRootDashboard = route === "/dashboard";
  const isActive = isRootDashboard
    ? pathname === route
    : pathname === route || pathname.startsWith(`${route}/`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          H-NEW-02 — WCAG 1.3.1 + 4.1.2: the active route was only
          communicated via `border-b-2` + icon color (color-only,
          invisible in forced-colors mode and to screen readers).
          `aria-current="page"` is the spec-defined mechanism for
          "this is the current page in a set of related pages".
        */}
        <Link
          href={route}
          aria-current={isActive ? "page" : undefined}
          className={cn("navlink", {
            "border-b-2 border-black dark:border-white": isActive,
          })}
        >
          <Icon
            className={cn("h-5 w-5", {
              "text-black dark:text-white": isActive,
            })}
          />
          <span className="sr-only">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default NavLink;
