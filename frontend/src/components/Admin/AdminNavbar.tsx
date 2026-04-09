import { useState } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from "lucide-react"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import useAuth from "@/hooks/useAuth"

function AdminNavbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, logout } = useAuth()

  const userName = user?.name || user?.email || "Admin"

  const isActive = (path: string) => location.pathname === path

  const navPillBase =
    "px-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2"
  const navPillActive = "bg-[#DDE8EA] !text-[#4B8798]"
  const navPillInactive =
    "bg-transparent text-[#4A4A4A] hover:bg-[#DDE8EA]/50"

  const navItems = [
    {
      label: "Dashboard",
      to: "/admin/dashboard",
      icon: LayoutDashboard,
    },
    { label: "Users", to: "/admin/users", icon: Users },
    { label: "Wards", to: "/admin/wards", icon: Building2 },
  ]

  return (
    <nav
      className="sticky top-0 z-50 w-full bg-white border-b"
      style={{ borderColor: "#E6E6E6" }}
    >
      {/* Desktop */}
      <div className="hidden md:flex h-16 items-center justify-between">
        {/* Brand */}
        <div className="flex items-center justify-center shrink-0 px-6">
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <img
              src="/assets/images/sach-navbarlogo.png"
              alt="SACH Logo"
              className="h-9"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex flex-1 justify-start">
          <NavigationMenu viewport={false}>
            <NavigationMenuList className="gap-2">
              {navItems.map((item) => (
                <NavigationMenuItem key={item.to}>
                  <NavigationMenuLink asChild>
                    <Link
                      to={item.to}
                      className={cn(
                        navPillBase,
                        isActive(item.to) ? navPillActive : navPillInactive,
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 px-6">
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              data-testid="admin-navbar-user"
            >
              <div className="w-8 h-8 rounded-full bg-[#4B8798] flex items-center justify-center text-white text-sm font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden lg:inline">{userName}</span>
              <ChevronDown className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 border border-[#E6E6E6] bg-white p-1 shadow-md"
            >
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer bg-white text-red-600 focus:bg-red-50 focus:text-red-600"
                data-testid="admin-navbar-signout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex h-14 items-center justify-between px-4">
        <Link to="/admin/dashboard" className="flex items-center">
          <img
            src="/assets/images/sach-navbarlogo.png"
            alt="SACH Logo"
            className="h-8"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        </Link>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
            <ShieldCheck className="w-3 h-3" />
            Admin
          </span>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-[#DDE8EA] text-[#4B8798]"
                  : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
          <div className="border-t pt-2 mt-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                logout()
              }}
              className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              data-testid="admin-navbar-signout"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}

export default AdminNavbar
