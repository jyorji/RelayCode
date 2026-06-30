import { NextResponse } from "next/server";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { syncUserFromAuth0 } from "./syncUser";

export const auth0 = new Auth0Client({
  async onCallback(error, ctx, session) {
    if (error) {
      return NextResponse.redirect(
        new URL(`/error?error=${error.message}`, ctx.appBaseUrl)
      );
    }

    if (session?.user) {
      try {
        await syncUserFromAuth0(session.user);
      } catch (err) {
        console.error("Failed to sync Auth0 user to database:", err);
      }
    }

    return NextResponse.redirect(new URL(ctx.returnTo || "/", ctx.appBaseUrl));
  },
});
