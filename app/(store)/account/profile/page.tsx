import type { Metadata } from "next";
import { headers } from "next/headers";
import { AccountFrame } from "@/components/store/account/account-frame";
import { ProfileForms } from "@/components/store/account/profile-forms";
import { requireCustomer } from "@/modules/account/data";
import { auth } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "My profile", robots: { index: false, follow: false } };

/** Profile and security (FR-AC-06): name, password, devices, and deleting the account. */
export default function ProfilePage() {
  return (
    <AccountFrame title="Profile and security">
      <Profile />
    </AccountFrame>
  );
}

async function Profile() {
  const c = await requireCustomer("/account/profile");
  const h = await headers();
  const [accounts, sessions] = await Promise.all([
    auth.api.listUserAccounts({ headers: h }),
    auth.api.listSessions({ headers: h }),
  ]);
  const providers = accounts.map((a) => a.providerId);
  return (
    <ProfileForms
      name={c.name}
      email={c.email}
      emailVerified={c.emailVerified}
      phone={c.phoneNumber}
      phoneVerified={c.phoneNumberVerified}
      hasPassword={providers.includes("credential")}
      google={providers.includes("google")}
      devices={sessions.length}
      isStaff={c.isStaff}
    />
  );
}
