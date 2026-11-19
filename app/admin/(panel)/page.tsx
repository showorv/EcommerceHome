import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/modules/auth/session";

/** Dashboard placeholder. Order and revenue widgets arrive with Phase 2 (FR-AD-01). */
export default async function AdminDashboardPage() {
  const { user, permissions } = await requireStaff();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome back, {user.name}.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {["Orders today", "Pending confirmation", "Low stock"].map((t) => (
          <Card key={t}>
            <CardHeader>
              <CardDescription>{t}</CardDescription>
              <CardTitle className="text-3xl">—</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">Available after Phase 2</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your permissions</CardTitle>
          <CardDescription>
            What your role ({user.role}) allows. The server checks these on every action.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[...permissions].sort().map((p) => (
            <Badge key={p} variant="outline" className="font-mono">
              {p}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
