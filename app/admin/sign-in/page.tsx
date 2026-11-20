import { AdminSignInForm } from "@/components/auth/admin-sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Reads the URL / session on every request, so this page renders on the server at request time.
export const instant = false;

const MESSAGES: Record<string, string> = {
  not_staff: "This account does not have admin access.",
  blocked: "This account is blocked. Contact the owner.",
};

export default async function AdminSignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? MESSAGES[error] : undefined;
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>Staff accounts only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {message && (
            <p className="bg-destructive/10 text-destructive rounded-md p-3 text-sm" role="alert">
              {message}
            </p>
          )}
          <AdminSignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
