"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      baseURL={appOrigin}
      defaultTheme="light"
      // Google only: the owner check needs a verified email, and Neon Auth
      // doesn't verify email/password sign-ups here.
      social={{ providers: ["google"] }}
      credentials={false}
      redirectTo="/auth/continue"
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
