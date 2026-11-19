import { InviteStaffForm, StaffTable } from "@/components/admin/staff-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/modules/auth/session";
import { listStaff } from "@/modules/staff/staff";

export default async function StaffPage() {
  const { user } = await requireStaff("staff.manage");
  const rows = await listStaff();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff & roles</h1>
        <p className="text-muted-foreground text-sm">
          Staff handle orders. Managers also run products, content and reports. Owners control everything.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invite a team member</CardTitle>
          <CardDescription>They get an email to set a password, then they can sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteStaffForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Changing a role or blocking someone signs them out immediately.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <StaffTable rows={rows} currentUserId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
