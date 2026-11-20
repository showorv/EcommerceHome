import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Reads the URL / session on every request, so this page renders on the server at request time.
export const instant = false;

export default async function SetPasswordPage({ searchParams }: PageProps<"/admin/set-password">) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose your password</CardTitle>
          <CardDescription>After this you can sign in to the admin panel.</CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <SetPasswordForm token={token} next="/admin/sign-in" />
          ) : (
            <p className="text-destructive text-sm">
              This link is invalid or has expired. Ask the owner for a new invite.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
