import type { User as Auth0Profile } from "@auth0/nextjs-auth0/types";
import { prisma } from "./db";

const AUTH0_PROVIDER = "auth0";

export async function syncUserFromAuth0(profile: Auth0Profile) {
  const { sub, email, name, picture } = profile;

  if (!email) {
    console.warn(`Auth0 profile ${sub} has no email; skipping user sync`);
    return null;
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: AUTH0_PROVIDER,
        providerAccountId: sub,
      },
    },
  });

  if (existingAccount) {
    return prisma.user.update({
      where: { id: existingAccount.userId },
      data: { email, name, image: picture },
    });
  }

  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      image: picture,
      accounts: {
        create: { provider: AUTH0_PROVIDER, providerAccountId: sub },
      },
    },
    update: {
      name,
      image: picture,
      accounts: {
        create: { provider: AUTH0_PROVIDER, providerAccountId: sub },
      },
    },
  });
}
