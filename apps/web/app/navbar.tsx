"use client";

import {
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "forge-ui";

export function Navbar({
  user,
}: {
  user: { name?: string | null; email?: string | null; picture?: string | null } | null;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <a href="/" className="text-lg font-semibold hover:opacity-75 transition-opacity">Relay</a>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Account menu">
              <Avatar src={user.picture ?? undefined} alt={user.name ?? user.email ?? "User"} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.name ?? user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="logout"
              destructive
              onClick={() => {
                window.location.href = "/auth/logout";
              }}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
