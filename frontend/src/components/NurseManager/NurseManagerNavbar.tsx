import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  CalendarDays,
  NotebookPen,
  Settings,
  User,
  Users,
  Menu,
  X,
  ChevronDown,
  Pencil,
  NotepadText,
  LogOut,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useAuth from "@/hooks/useAuth";

function NurseManagerNavbar() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leaveShiftExpanded, setLeaveShiftExpanded] = useState(false);
  const { user, logout } = useAuth();

  const userName = user?.name || user?.email || "Manager";

  // Check if current path matches exactly
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Check if current path is within a section (for dropdown parent highlighting)
  const isSectionActive = (paths: string[]) => {
    return paths.some((path) => location.pathname === path);
  };

  const leaveShiftPaths = ["/nurse-manager/request-application", "/nurse-manager/request-overview"];
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
          <Link to="/nurse-manager" className="flex items-center">
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
                    to="/nurse-manager/home"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/nurse-manager/home")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                    <Home className="h-4 w-4 text-[#4B8798]" />
                    <span>Home</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Roster Planning */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/nurse-manager/roster-planning"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/nurse-manager/roster-planning")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                    <CalendarDays className="h-4 w-4 text-[#4B8798]" />
                    <span>Roster Planning</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Leave and Shift Overview - DROPDOWN */}
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
                  <span>Leave and Shift Overview</span>
                </NavigationMenuTrigger>
                <NavigationMenuContent className="left-0 w-full min-w-full translate-y-1 rounded-md border border-[#E6E6E6] bg-white p-1 shadow-md">
                  <ul className="flex flex-col gap-0.5">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          to="/nurse-manager/request-application"
                          className={cn(
                            "w-full inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                            isActive("/nurse-manager/request-application")
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
                          to="/nurse-manager/request-overview"
                          className={cn(
                            "w-full inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                            isActive("/nurse-manager/request-overview")
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

              {/* Ward Staff Directory */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/nurse-manager/ward-staff-directory"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/nurse-manager/ward-staff-directory")
                        ? navPillActiveStyles
                        : navPillInactiveStyles,
                    )}
                  >
                    <Users className="h-4 w-4 text-[#4B8798]" />
                    <span>Ward Staff Directory</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Settings */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    to="/nurse-manager/settings"
                    className={cn(
                      navPillBaseStyles,
                      isActive("/nurse-manager/settings")
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
          {/* Notification Bell Dropdown */}
          <NotificationDropdown role="manager" />

          {/* Staff Name Display with Logout Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(utilityPillStyles, "text-[#4A4A4A] hover:bg-[#DDE8EA]/50")}>
                <User className="h-5 w-5 shrink-0 text-[#4B8798]" />
                <span>{userName}</span>
                <ChevronDown className="h-4 w-4 text-[#4B8798]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 border-0">
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer bg-white border-width-0 text-red-600 focus:text-red-600"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <Link to="/nurse-manager" className="flex items-center">
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
        <NotificationDropdown role="manager" />
      </div>

      {/* Mobile Dropdown Panel (appears below navbar) - NO backdrop */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed left-0 top-14 z-50 w-[75vw] max-w-[320px] h-[calc(100vh-3.5rem)] rounded-r-xl border border-l-0 border-[#E6E6E6] bg-white shadow-lg overflow-hidden">
          <div className="h-full overflow-y-auto px-4 pt-4">
            {/* Staff Identity Header */}
            <div className="!px-2 pt-6 pb-5 mb-6 border-b border-[#E6E6E6]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <User className="h-[18px] w-[18px] text-[#4B8798]" />
                  <span className="text-sm font-medium text-[#4A4A4A]">{userName}</span>
                </div>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>

            {/* spacer between home and staff name */}
            <div className="h-4" />

            {/* Navigation Menu Items */}
            <nav className="flex flex-col gap-4">
              {/* Home */}
              <Link
                to="/nurse-manager/home"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/nurse-manager/home")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <Home className="h-4 w-4 text-[#4B8798]" />
                  Home
                </span>
              </Link>

              {/* Roster Planning */}
              <Link
                to="/nurse-manager/roster-planning"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/nurse-manager/roster-planning")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <CalendarDays className="h-4 w-4 text-[#4B8798]" />
                  Roster Planning
                </span>
              </Link>

              {/* Leave and Shift Overview - EXPANDABLE */}
              <div className="flex flex-col">
                <button
                  onClick={() => setLeaveShiftExpanded(!leaveShiftExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <span
                    className={cn(
                      "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                      isLeaveShiftActive
                        ? "bg-[#DCECEF] text-[#4B8798]"
                        : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                    )}
                  >
                    <NotebookPen className="h-4 w-4 text-[#4B8798]" />
                    Leave and Shift Overview
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
                  <div className="ml-8 mt-2 flex flex-col gap-1.5 pl-4">
                    <Link
                      to="/nurse-manager/request-application"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={cn(
                          "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                          isActive("/nurse-manager/request-application")
                            ? "bg-[#DCECEF] text-[#4B8798]"
                            : "text-[#6B7280] hover:bg-[#DDE8EA]/50 hover:text-[#4A4A4A]",
                        )}
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        Application
                      </span>
                    </Link>
                    <Link
                      to="/nurse-manager/request-overview"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={cn(
                          "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                          isActive("/nurse-manager/request-overview")
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

              {/* Ward Staff Directory */}
              <Link
                to="/nurse-manager/ward-staff-directory"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/nurse-manager/ward-staff-directory")
                      ? "bg-[#DCECEF] text-[#4B8798]"
                      : "text-[#4A4A4A] hover:bg-[#DDE8EA]/50",
                  )}
                >
                  <Users className="h-4 w-4 text-[#4B8798]" />
                  Ward Staff Directory
                </span>
              </Link>

              {/* Settings */}
              <Link
                to="/nurse-manager/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center"
              >
                <span
                  className={cn(
                    "w-fit inline-flex items-center gap-2 !px-2 !py-1 !rounded-lg text-sm font-medium transition-colors",
                    isActive("/nurse-manager/settings")
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

export default NurseManagerNavbar;
