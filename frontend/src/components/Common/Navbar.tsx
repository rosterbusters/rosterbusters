import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Table,
  NotebookPen,
  Settings,
  User,
  Menu,
  X,
  ChevronDown,
  Pencil,
  NotepadText,
  Bell,
} from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import NotificationDropdown from "@/components/Common/NotificationDropdown";

function Navbar() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leaveShiftExpanded, setLeaveShiftExpanded] = useState(false);

  // TODO: Replace with actual backend data
  const userName = "Staff Name";

  // Check if current path matches exactly
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Check if current path is within a section (for dropdown parent highlighting)
  const isSectionActive = (paths: string[]) => {
    return paths.some((path) => location.pathname === path);
  };

  const leaveShiftPaths = ["/leave-request", "/shift-request"];
  const isLeaveShiftActive = isSectionActive(leaveShiftPaths);

  // Standardized nav pill styles - ensures consistent height, spacing, and alignment
  const navPillBaseStyles =
    "px-1 inline-flex h-8 items-center justify-center gap-1 rounded-lg text-sm font-medium tracking-[0.07px] transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2";
  const navPillActiveStyles = "bg-[#DDE8EA] !text-[#4B8798]";
  const navPillInactiveStyles =
    "bg-transparent text-[#4A4A4A] hover:bg-[#DDE8EA]/50";
  // Utility pill for non-clickable elements (like staff name display)
  const utilityPillStyles =
    "cursor-pointer inline-flex h-10 items-center gap-1 rounded-xl px-6 text-sm font-medium tracking-[0.07px]";

  return (
    <nav
      className="sticky top-0 z-50 w-full bg-white border-b"
      style={{ borderColor: "#E6E6E6" }}
    >
      {/* ============================================ */}
      {/* DESKTOP NAVIGATION (hidden on mobile)       */}
      {/* ============================================ */}
      <div className="hidden md:flex h-16 items-center justify-between">
        {/* LEFT ZONE: Brand */}
        <div className="flex items-center justify-center shrink-0 px-6">
          <Link to="/home" className="flex items-center">
            <img
              src="/assets/images/sach-navbarlogo.png"
              alt="SACH Logo"
              className="h-9"
              onError={(e) => {
                e.currentTarget.src = "/assets/images/sach-navbarlogo.png";
              }}
            />
          </Link>
        </div>

        {/* MIDDLE ZONE: Primary Navigation - Desktop horizontal row */}
        <div className="flex flex-2 justify-start">
          <NavigationMenu viewport={false}>
            <NavigationMenuList className="gap-4">
              {/* Home */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/home"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/home")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                      <Home className="h-4 w-4 text-[#4B8798]" />
                    <span>Home</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Staff Roster Schedule */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/staffrosterschedule"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/staffrosterschedule")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                      <Table className="h-4 w-4 text-[#4B8798]" />
                    <span>Staff Roster Schedule</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Leave and Shift Request - DROPDOWN */}
              <NavigationMenuItem className="relative">
                <NavigationMenuTrigger
                  className={cn(
                    navPillBaseStyles,
                    isLeaveShiftActive
                      ? navPillActiveStyles
                      : navPillInactiveStyles,

                    // put overrides LAST so they win
                    "!hover:bg-[#DDE8EA]/50",
                    "data-[state=open]:!bg-[#DDE8EA]/50",
                  )}
                >
                    <NotebookPen className="h-4 w-4 text-[#4B8798]" />
                    <span>Leave and Shift Request </span>
                </NavigationMenuTrigger>
                <NavigationMenuContent className="left-0 w-full min-w-full translate-y-1 rounded-md border border-[#E6E6E6] bg-white p-1 shadow-md">
                  <ul className="flex flex-col gap-0.5">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          to="/request-application"
                          className={cn(
                            "w-full inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                            isActive("/request-application")
                              ? "bg-[#DDE8EA] text-[#4B8798]"
                              : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                          )}
                        >
                          <Pencil className="h-4 w-4 shrink-0 text-[#4B8798]" />
                          Application
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          to="/shift-request"
                          className={cn(
                            "w-full inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                            isActive("/shift-request")
                              ? "bg-[#DDE8EA] text-[#4B8798]"
                              : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                          )}
                        >
                          <NotepadText className="h-4 w-4 shrink-0 text-[#4B8798]" />
                          Overview
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Settings */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/settings"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/settings")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                      <Settings className="h-4 w-4 text-[#4B8798]" />
                      Settings
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* RIGHT ZONE: Utilities */}
        <div className="flex items-center shrink-0">
          {/* Notification Bell */}
          <button
            className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-[#DDE8EA]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 shrink-0 text-[#4B8798]" />
          </button>

          {/* Staff Name Display */}
          <div className={cn(utilityPillStyles, "text-[#4A4A4A]")}>
            <User className="h-5 w-5 shrink-0 text-[#4B8798]" />
            <span>{userName}</span>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* MOBILE NAVIGATION (visible on mobile only)  */}
      {/* ============================================ */}
      <div className="relative flex md:hidden h-14 items-center justify-between">
        {/* Left: Hamburger Menu / Close Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={cn(
            "h-10 w-10 flex items-center justify-center transition-colors",
            mobileMenuOpen
              ? "bg-[#DCECEF] rounded-xl"
              : "hover:bg-[#DDE8EA]/50 rounded-lg",
          )}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5 text-[#4B8798]" />
          ) : (
            <Menu className="h-5 w-5 text-[#4B8798]" />
          )}
        </button>

        {/* Center: Hospital Logo */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Link to="/home" className="flex items-center">
            <img
              src="/assets/images/sach-navbarlogo.png"
              alt="SACH Logo"
              className="h-6 max-h-7"
              style={{ width: "auto", maxWidth: "120px" }}
              onError={(e) => {
                e.currentTarget.src = "/assets/images/sach-navbarlogo.png";
              }}
            />
          </Link>
        </div>

        {/* Right: Notification Bell Dropdown */}
        <NotificationDropdown />
      </div>

      {/* Mobile Dropdown Panel (appears below navbar) - NO backdrop */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed left-0 top-14 z-50 ml-3 w-[75vw] max-w-[320px] h-[calc(100vh-3.5rem)] rounded-r-xl border border-l-0 border-[#E6E6E6] bg-white shadow-lg overflow-hidden">
          <div className="h-full overflow-y-auto px-4 pt-4">
            {/* Staff Identity Header */}
            <div className="!px-2 pt-6 pb-5 mb-6 border-b border-[#E6E6E6]">
              <div className="flex items-center gap-1">
                <User className="h-[18px] w-[18px] text-[#4B8798]" />
                <span className="text-sm font-medium text-[#4A4A4A]">{`{${userName}}`}</span>
              </div>
            </div>

            {/* spacer between home and staff name */}
            <div className="h-4" />

            {/* Navigation Menu Items */}
            <nav className="flex flex-col">
              {/* Home */}
              <Link
                to="/home"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    // roomier pill
                    "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/home")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <Home className="h-4 w-4 text-[#4B8798]" />
                  Home
                </span>
              </Link>

              {/* Staff Roster Schedule */}
              <Link
                to="/staffrosterschedule"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/staffrosterschedule")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <Table className="h-4 w-4 text-[#4B8798]" />
                  Staff Roster Schedule
                </span>
              </Link>

              {/* Leave and Shift Request - EXPANDABLE */}
              <div className="flex flex-col">
                <button
                  onClick={() => setLeaveShiftExpanded(!leaveShiftExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <span
                    className={cn(
                      "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                      isLeaveShiftActive
                        ? "bg-[#DCECEF] text-[#4B8798]"
                        : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                    )}
                  >
                    <NotebookPen className="h-4 w-4 text-[#4B8798]" />
                    Leave and Shift Request
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-[#4B8798] transition-transform duration-200 mr-2",
                      leaveShiftExpanded && "rotate-180",
                    )}
                  />
                </button>

                {/* Submenu Items - indented */}
                {leaveShiftExpanded && (
                  <div className="ml-8 mt-2 flex flex-col gap-1.5 pl-4 border-2 border-[#E6E6E6]">
                    <Link
                      to="/leave-request"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={cn(
                          "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                          isActive("/leave-request")
                            ? "bg-[#DCECEF] text-[#4B8798]"
                            : "text-[#6B7280] hover:bg-[#DDE8EA]/50 hover:text-[#4A4A4A]",
                        )}
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        Application
                      </span>
                    </Link>
                    <Link
                      to="/shift-request"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={cn(
                          "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                          isActive("/shift-request")
                            ? "bg-[#DCECEF] text-[#4B8798]"
                            : "text-[#6B7280] hover:bg-[#DDE8EA]/50 hover:text-[#4A4A4A]",
                        )}
                      >
                        <NotepadText className="h-4 w-4 shrink-0" />
                        Overview
                      </span>
                    </Link>
                  </div>
                )}
              </div>

              {/* Settings */}
              <Link
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-1 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/settings")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <Settings className="h-4 w-4 text-[#4B8798]" />
                  Settings
                </span>
              </Link>
            </nav>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
