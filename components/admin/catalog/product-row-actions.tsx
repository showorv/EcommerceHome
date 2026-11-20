"use client";

import { Copy, MoreHorizontal, Pencil, Archive, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProductAction, duplicateProductAction, setProductStatusAction } from "@/modules/catalog/actions";
import type { ProductStatus } from "@/modules/catalog/products";
import { report } from "./form-bits";

export function ProductRowActions({
  id,
  title,
  slug,
  status,
  canEdit,
  canDelete,
}: {
  id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending}>
          <MoreHorizontal className="size-4" aria-hidden />
          <span className="sr-only">Actions for {title}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/products/${id}`}>
            <Pencil className="size-4" aria-hidden /> {canEdit ? "Edit" : "View"}
          </Link>
        </DropdownMenuItem>
        {status === "active" && (
          <DropdownMenuItem asChild>
            <a href={`/p/${slug}`} target="_blank" rel="noreferrer">
              <Eye className="size-4" aria-hidden /> View on store
            </a>
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const res = await duplicateProductAction(id);
                if (report(res) && res.ok && res.data) router.push(`/admin/products/${res.data.id}`);
              })
            }
          >
            <Copy className="size-4" aria-hidden /> Duplicate
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            {status !== "archived" ? (
              <DropdownMenuItem
                onSelect={() => start(async () => void report(await setProductStatusAction(id, "archived")))}
              >
                <Archive className="size-4" aria-hidden /> Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => start(async () => void report(await setProductStatusAction(id, "draft")))}
              >
                <Archive className="size-4" aria-hidden /> Restore as draft
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (
                  !confirm(
                    `Delete "${title}"? It disappears from the admin and the store. Order history keeps its copy.`,
                  )
                )
                  return;
                start(async () => void report(await deleteProductAction(id)));
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
