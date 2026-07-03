"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "forge-ui";

const NAV_ITEMS = [
  { label: "Sessions", href: "/" },
  { label: "Problems", href: "/problems" },
];

export function Navbar({
  user,
}: {
  user: { name?: string | null; email?: string | null; picture?: string | null } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-4">
        <a href="/" className="text-base font-semibold hover:opacity-75 transition-opacity mr-2">
          Relay
        </a>

        {user && (
          <nav className="flex items-center gap-2">
            {NAV_ITEMS.map(({ label, href }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Button
                  key={href}
                  variant={isActive ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => router.push(href)}
                >
                  {label}
                </Button>
              );
            })}
          </nav>
        )}
      </div>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Account menu">
              <Avatar src={user.picture ?? undefined} alt={user.name ?? user.email ?? "User"} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-2">
            <DropdownMenuLabel>{user.name ?? user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="logout"
              destructive
              onClick={() => { window.location.href = "/auth/logout"; }}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
