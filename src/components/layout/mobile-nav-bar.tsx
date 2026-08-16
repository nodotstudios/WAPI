"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Kanban, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavBarProps {
  /** Optional unread count badge for inbox */
  unreadCount?: number;
}

export function MobileNavBar({ unreadCount = 0 }: MobileNavBarProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/inbox",
      label: "Inbox",
      icon: MessageSquare,
      active: pathname.startsWith("/inbox"),
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      href: "/pipelines",
      label: "CRM",
      icon: Kanban,
      active: pathname.startsWith("/pipelines") && !pathname.includes("schedule"),
    },
    {
      href: "/pipelines?view=schedule",
      label: "Schedule",
      icon: Calendar,
      active: pathname.startsWith("/pipelines") && (pathname.includes("schedule") || pathname.includes("tab=schedule")),
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border/80 bg-background/95 backdrop-blur-md pb-safe lg:hidden [.hide-mobile-nav_&]:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-col items-center justify-center py-1 px-3 text-xs font-medium transition-colors",
              item.active
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative">
              <Icon className={cn("size-5 transition-transform", item.active && "scale-110")} />
              {item.badge ? (
                <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </div>
            <span className="mt-1 text-[10px] tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
