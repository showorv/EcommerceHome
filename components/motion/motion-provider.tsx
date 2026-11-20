"use client";

import { MotionConfig } from "motion/react";
import { createContext, use, type ReactNode } from "react";

/**
 * Motion level set by admins (FR-SF-04): "full" | "reduced" | "off".
 * "full" still respects the visitor's OS reduce-motion setting (FR-SF-05).
 */
export type MotionLevel = "full" | "reduced" | "off";

const MotionLevelContext = createContext<MotionLevel>("full");

export function MotionProvider({ level = "full", children }: { level?: MotionLevel; children: ReactNode }) {
  return (
    <MotionLevelContext value={level}>
      <MotionConfig reducedMotion={level === "full" ? "user" : "always"}>{children}</MotionConfig>
    </MotionLevelContext>
  );
}

export function useMotionLevel(): MotionLevel {
  return use(MotionLevelContext);
}
