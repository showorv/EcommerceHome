import { ViewTransition, type ReactNode } from "react";

/**
 * Page transitions in the store (FR-SF-04). A template is re-created on every navigation to another
 * page (not for filter or sort changes, which only change the address's ?query), so the old page plays
 * its exit and the new one its enter animation. The animations, and how the motion level and the
 * shopper's "reduce motion" setting turn them down, are in app/globals.css ("Page transitions").
 */
export default function StoreTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
