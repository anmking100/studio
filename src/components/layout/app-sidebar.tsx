
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { LayoutDashboard, Users, ListChecks, Settings, LogOut, ExternalLink, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team-overview", label: "Team Overview", icon: Users },
  { href: "/task-batching", label: "Task Batching", icon: ListChecks },
  { 
    href: "/integrations/microsoft-graph", 
    label: "MS Graph Users", 
    icon: Briefcase,
    group: "Integrations" 
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const { state: sidebarState } = useSidebar(); // Get sidebar collapsed state
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (!mounted || authLoading) {
    // Show skeleton while loading to prevent hydration mismatch or flashing
    return (
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Logo collapsed={sidebarState === 'collapsed'} />
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {[...Array(navItems.length)].map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton showIcon={true} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <SidebarMenuSkeleton showIcon={true} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" defaultOpen={true} >
      <SidebarHeader className="border-b border-sidebar-border">
        <Logo collapsed={sidebarState === 'collapsed'} />
      </SidebarHeader>
      <SidebarContent className="flex-grow p-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
                  tooltip={{ children: item.label, className: "bg-popover text-popover-foreground" }}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="mt-auto border-t border-sidebar-border p-2">
        {/* Placeholder for potential future items or just a logout button */}
        <SidebarMenu>
           <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => router.push('/settings')}
                  isActive={pathname === '/settings'}
                  tooltip={{ children: "Settings", className: "bg-popover text-popover-foreground" }}
                  disabled // Remove disabled prop when settings page is implemented
                >
                  <Settings className="h-5 w-5" />
                  <span className="truncate">Settings</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip={{children: "Log Out", className: "bg-popover text-popover-foreground"}}>
              <LogOut className="h-5 w-5 text-destructive" />
              <span className="truncate text-destructive">Log Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
         <div className="text-center text-xs text-sidebar-foreground/70 mt-4 group-data-[collapsible=icon]:hidden">
            <p>&copy; {new Date().getFullYear()} FocusFlow</p>
            <Link href="https://www.example.com" target="_blank" rel="noopener noreferrer" className="hover:text-sidebar-primary transition-colors">
              Privacy Policy <ExternalLink className="inline h-3 w-3" />
            </Link>
          </div>
      </SidebarFooter>
    </Sidebar>
  );
}
