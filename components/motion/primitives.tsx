"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useMotionLevel } from "./motion-provider";

/** Shared spring used across the store so motion feels consistent. */
export const SPRING = { type: "spring", stiffness: 260, damping: 24, mass: 0.8 } as const;

/** Pop/lift on hover (the base for the product card in FR-PC-03). */
export function Lift({ children, className }: { children: ReactNode; className?: string }) {
  const level = useMotionLevel();
  const reduce = useReducedMotion();
  const still = level !== "full" || reduce;
  return (
    <motion.div
      className={className}
      whileHover={still ? undefined : { y: -6, scale: 1.02 }}
      whileTap={still ? undefined : { scale: 0.98 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}
