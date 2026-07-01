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
        <div className="flex items-center gap-4">
          <a href="/problems" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Problems
          </a>
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
        </div>
      )}
    </header>
  );
}
