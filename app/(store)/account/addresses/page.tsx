import type { Metadata } from "next";
import { AccountFrame } from "@/components/store/account/account-frame";
import { AddressBook } from "@/components/store/account/address-book";
import { listAddresses, requireCustomer } from "@/modules/account/data";
import { getDeliveryConfig } from "@/modules/delivery/data";

export const metadata: Metadata = { title: "My addresses", robots: { index: false, follow: false } };

/** Saved addresses (FR-AC-06); the default one fills the checkout. */
export default function AddressesPage() {
  return (
    <AccountFrame title="My addresses">
      <Addresses />
    </AccountFrame>
  );
}

async function Addresses() {
  const c = await requireCustomer("/account/addresses");
  const [list, config] = await Promise.all([listAddresses(c.id), getDeliveryConfig()]);
  return (
    <AddressBook
      initial={list}
      districts={config.districts.map((d) => ({ id: d.id, name: d.name }))}
      areas={config.areas.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, districtId: a.districtId }))}
    />
  );
}
