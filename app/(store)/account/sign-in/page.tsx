import { Suspense } from "react";
import { CustomerSignInForm } from "@/components/auth/customer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <div className="mx-auto flex max-w-sm px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Reads ?next= in the browser, so the page itself stays static. */}
          <Suspense fallback={null}>
            <CustomerSignInForm googleEnabled={googleEnabled} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
