"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { useMotionLevel } from "./motion-provider";

/** Shared spring used across the store so motion feels consistent. */
export const SPRING = { type: "spring", stiffness: 260, damping: 24, mass: 0.8 } as const;

/** Scroll-reveal for sections (FR-SF-04). Animates transform + opacity only (NFR-PF-03). */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  ...rest
}: { children: ReactNode; delay?: number; y?: number } & Omit<HTMLMotionProps<"div">, "children">) {
  const level = useMotionLevel();
  const reduce = useReducedMotion();
  const still = level === "off" || reduce;
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y: level === "reduced" ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ ...SPRING, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Reveals children one after another. Wrap items in <StaggerItem>. */
export function Stagger({
  children,
  className,
  gap = 0.06,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const level = useMotionLevel();
  const reduce = useReducedMotion();
  const still = level === "off" || reduce;
  return (
    <motion.div
      className={className}
      initial={still ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: SPRING } }}
    >
      {children}
    </motion.div>
  );
}

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
