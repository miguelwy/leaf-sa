import {
  Briefcase,
  Building2,
  CalendarClock,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown but labelled as planned; renders an explanation page, not mock data. */
  planned?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/account-executives", label: "Account Executives", icon: Briefcase },
  { href: "/meetings", label: "Meetings", icon: CalendarClock },
  { href: "/action-items", label: "Action Items", icon: ListChecks },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
