
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { LayoutDashboard, Users, ListChecks, Settings, LogOut, ExternalLink, Briefcase, Cog } from "lucide-react"; // Added Cog
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Package } from "lucide-react"; // Example icon for Teams
import { Atlassian } from "lucide-react"; // Example icon for Jira, if available, else use generic

// Helper to create a generic icon if specific one isn't in lucide
const JiraIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12.296 2.017L2.078 6.075a.302.302 0 00-.197.355l4.08 13.536a.301.301 0 00.353.198l10.22-4.057a.302.302 0 00.197-.355L12.647 2.215a.304.304 0 00-.35-.198zm-.39 1.408l8.315 3.3-3.29 10.92-8.313-3.3zm-1.02 8.13l-2.057-.816 1.24-4.122 2.056.816z"></path>
  </svg>
);


const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { href: "/team-overview", label: "Team Overview", icon: Users, group: "Main" },
  { href: "/task-batching", label: "Task Batching", icon: ListChecks, group: "Main" },
  { 
    href: "/integrations/microsoft-graph", 
    label: "MS Graph Users", 
    icon: Briefcase,
    group: "Integrations" 
  },
  { 
    href: "/integrations/teams", 
    label: "Teams", 
    icon: Package, // Using Package as a placeholder for Teams icon
    group: "Integrations" 
  },
   { 
    href: "/integrations/jira", 
    label: "Jira", 
    icon: JiraIcon,
    group: "Integrations" 
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const { state: sidebarState } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // Group navigation items
  const groupedNavItems = navItems.reduce((acc, item) => {
    const group = item.group || "Main";
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);


  if (!mounted || authLoading) {
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
        {Object.entries(groupedNavItems).map(([groupName, items], index) => (
          <SidebarGroup key={groupName} className="p-0">
            {groupName !== "Main" && (
              <>
              {index > 0 && <SidebarSeparator className="my-2" />}
              <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/60 px-2 pt-2 group-data-[collapsible=icon]:hidden">
                {groupName}
              </SidebarGroupLabel>
              </>
            )}
             <SidebarMenu className="mt-1">
              {items.map((item) => (
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
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="mt-auto border-t border-sidebar-border p-2">
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
