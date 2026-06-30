"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Icon,
  buttonVariants,
} from "forge-ui";

export function AuthCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome to Relay</CardTitle>
        <CardDescription>Sign in to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href="/auth/login"
          className={buttonVariants({
            variant: "primary",
            size: "lg",
            fullWidth: true,
          })}
        >
          <Icon name="login" />
          Log in
        </a>
      </CardContent>
    </Card>
  );
}
