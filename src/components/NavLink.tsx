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
  const isActive =
    route === pathname || pathname.startsWith(`${route}/dashboard`);
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
