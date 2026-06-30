import jwt from "jsonwebtoken";
import { prisma } from "./db";

const AUTH0_PROVIDER = "auth0";

export async function mintRelayToken(auth0Sub: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: AUTH0_PROVIDER, providerAccountId: auth0Sub } },
  });
  if (!account) return null;

  return jwt.sign({ sub: account.userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}
