"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Distance scrolled before the button appears. */
const SHOW_AFTER_PX = 600;

/**
 * Floating "back to top" button. Appears once the page is scrolled past
 * SHOW_AFTER_PX and smooth-scrolls to the top (plain jump when the user
 * prefers reduced motion). Hidden from print and from screen readers via
 * aria-label (it carries no text).
 */
export function ScrollTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <Button
      variant="outline"
      size="icon"
      className={
        "fixed right-4 bottom-4 z-40 size-11 rounded-full border-zinc-200 bg-white/95 text-zinc-700 shadow-lg backdrop-blur transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 print:hidden sm:right-6 sm:bottom-6 " +
        (visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0")
      }
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }}
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </Button>
  );
}
