import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardCheck,
  GraduationCap,
  PoundSterling,
  Award,
  CalendarClock,
  HeartPulse,
  Settings,
  UploadCloud,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  Activity,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import amigaLogo from "@/assets/amiga-logo.png";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { CurrentUserRole } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type NavItem = {
  name: string;
  icon: typeof LayoutDashboard;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  roles: CurrentUserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard", active: true, roles: ["admin"] },
  { name: "Employees", icon: Users, href: "/employees", active: true, roles: ["admin"] },
  { name: "Recruitment", icon: UserPlus, href: "/recruitment", active: true, roles: ["admin"] },
  { name: "Onboarding", icon: ClipboardCheck, href: "/onboarding", active: true, roles: ["admin"] },
  { name: "Training", icon: GraduationCap, href: "/training", active: true, roles: ["admin"] },
  { name: "Leave", icon: CalendarClock, href: "/leave", active: true, roles: ["admin"] },
  { name: "Sickness", icon: HeartPulse, href: "/sickness", active: true, roles: ["admin"] },
  { name: "Pay", icon: PoundSterling, href: "/pay", active: true, roles: ["admin"] },
  { name: "Benefits", icon: Award, href: "/benefits", active: true, roles: ["admin"] },
  { name: "Import", icon: UploadCloud, href: "/import", active: true, roles: ["admin"] },
  { name: "Cleanup health", icon: Activity, href: "/admin/cleanup-health", active: true, roles: ["admin"] },
  { name: "Team leave", icon: Users, href: "/team-leave", active: true, roles: ["manager"] },
  { name: "Team sickness", icon: HeartPulse, href: "/team-sickness", active: true, roles: ["manager"] },
  { name: "Team pay", icon: PoundSterling, href: "/team-pay", active: true, roles: ["manager"] },
  { name: "Team recruitment", icon: UserPlus, href: "/team-recruitment", active: true, roles: ["manager"] },
  { name: "My leave", icon: CalendarClock, href: "/my-leave", active: true, roles: ["manager", "employee"] },
  { name: "My profile", icon: UserRound, href: "/my-profile", active: true, roles: ["manager", "employee"] },
  { name: "Users & roles", icon: ShieldCheck, href: "/admin/users", active: true, roles: ["admin"] },
  { name: "Settings", icon: Settings, href: "/settings", active: true, roles: ["admin"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { role } = useCurrentUser();
  const navItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  const NavLinks = () => (
    <nav className="flex-1 space-y-1 py-4">
      {navItems.map((item) => {
        const isActive = location.startsWith(item.href || "");
        
        if (item.disabled) {
          return (
            <div key={item.name} className="flex items-center justify-between px-6 py-3 text-sm font-medium text-white/50 cursor-not-allowed">
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
                {item.name}
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-full">
                {item.badge}
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.name}
            href={item.href!}
            className="block"
            data-testid={`sidebar-link-${item.href!.replace(/^\//, "").replaceAll("/", "-")}`}
          >
            <div
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors relative ${
                isActive 
                  ? "text-white bg-white/5" 
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#C5A059]" />
              )}
              <item.icon className={`h-5 w-5 ${isActive ? "text-[#C5A059]" : "text-white/50"}`} />
              {item.name}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const UserCard = () => {
    const { user } = useUser();
    const { signOut } = useClerk();

    const fullName = user?.fullName?.trim();
    const email = user?.primaryEmailAddress?.emailAddress ?? "";
    const displayName = fullName || email || "User";
    const initials = (
      fullName
        ? fullName
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
        : email[0] ?? "U"
    ).toUpperCase();

    return (
    <div className="border-t border-white/10">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 bg-[#C5A059] text-[#000033]">
            <AvatarFallback className="bg-[#C5A059] text-[#000033] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            {email && <p className="text-xs text-white/50 truncate">{email}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            title="Log out"
            className="text-white/50 hover:text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="px-4 pb-4 pt-0">
        <p className="text-[10px] text-white/30 leading-relaxed tracking-wide">
          A licensed and bespoke product of
          <br />
          <span className="text-[#C5A059]/70 font-medium">Tower Street Web &amp; Apps</span>
        </p>
      </div>
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-[#000033] text-white">
        <img 
          src={amigaLogo} 
          alt="Amiga Specialty" 
          className="h-8 object-contain"
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              aria-label="Open navigation menu"
              data-testid="mobile-menu-trigger"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-[#000033] p-0 border-r-white/10 flex flex-col">
            <div className="p-6 border-b border-white/10">
              <img 
                src={amigaLogo} 
                alt="Amiga Specialty" 
                className="h-10 object-contain"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks />
            </div>
            <UserCard />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#000033] flex-col border-r border-white/10 shrink-0">
        <div className="p-6 h-20 flex items-center border-b border-white/10">
          <img 
            src={amigaLogo} 
            alt="Amiga Specialty" 
            className="h-9 object-contain"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>
        <UserCard />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}