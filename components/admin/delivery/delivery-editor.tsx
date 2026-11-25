"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DeliveryData } from "@/modules/delivery/data";
import { AreasTab } from "./areas-tab";
import { RulesTab } from "./rules-tab";
import { TryTab } from "./try-tab";
import { ZonesTab } from "./zones-tab";

export type PickerProduct = { id: string; title: string; status: string };

/** Admin → Delivery (FR-AD-08). Every save refreshes the page, so `data` is always the saved state. */
export function DeliveryEditor({ data, products }: { data: DeliveryData; products: PickerProduct[] }) {
  return (
    <Tabs defaultValue="zones">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="zones">Zones & charges</TabsTrigger>
        <TabsTrigger value="areas">Districts & areas</TabsTrigger>
        <TabsTrigger value="rules">Free delivery & rules</TabsTrigger>
        <TabsTrigger value="try">Try it</TabsTrigger>
      </TabsList>
      <TabsContent value="zones" className="mt-4">
        <ZonesTab data={data} />
      </TabsContent>
      <TabsContent value="areas" className="mt-4">
        <AreasTab data={data} />
      </TabsContent>
      <TabsContent value="rules" className="mt-4">
        <RulesTab rules={data.rules} products={products} />
      </TabsContent>
      <TabsContent value="try" className="mt-4">
        <TryTab data={data} products={products} />
      </TabsContent>
    </Tabs>
  );
}
