import { CustomerSignUpForm } from "@/components/auth/customer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <div className="mx-auto flex max-w-sm px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerSignUpForm googleEnabled={googleEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
