import { AdminNav, type NavItem } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requiredPermission } from "@/modules/auth/admin-routes";
import { requireStaff } from "@/modules/auth/session";
import { pendingOrderCount } from "@/modules/orders/admin-data";

/** Menu items appear only when the user has the permission (admin-routes.ts); proxy.ts and the pages check again. */
const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/storefront", label: "Storefront" },
  { href: "/admin/appearance", label: "Menus & theme" },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/order-rules", label: "Order rules" },
  { href: "/admin/blocked-numbers", label: "Blocked numbers" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/staff", label: "Staff & roles" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/system", label: "Jobs & system" },
];

export default async function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  const { user, permissions } = await requireStaff();
  // Orders waiting for a call, shown on the Orders item (SRS §2.4).
  const waiting = permissions.has("orders.view") ? await pendingOrderCount() : 0;
  const items = NAV.filter((n) => {
    const p = requiredPermission(n.href);
    return !p || permissions.has(p);
  }).map((n) => (n.href === "/admin/orders" && waiting > 0 ? { ...n, badge: waiting } : n));

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="bg-sidebar border-b p-3 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:p-4">
        <div className="mb-3 hidden px-3 text-sm font-semibold md:block">{process.env.STORE_NAME ?? "Store"} admin</div>
        <AdminNav items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 text-sm">
            <span className="font-medium">{user.name}</span>{" "}
            <Badge variant="secondary" className="ml-1 capitalize">
              {user.role}
            </Badge>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
