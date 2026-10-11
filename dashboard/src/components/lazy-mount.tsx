"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Lazy-mount wrapper for below-the-fold sections.
 *
 * The dashboard is a single long page (nine phase sections + explorer + docs
 * viewer). Rendering every section eagerly — both in the server-side pass
 * and the client hydration — pushes the dev server's memory beyond what
 * this sandbox can hold next to the ML service. This wrapper renders a
 * lightweight placeholder until the section approaches the viewport
 * (IntersectionObserver, 600px root margin so content is ready before the
 * user reaches it), then mounts the real section once — and keeps it
 * mounted (state is not lost when scrolling away).
 *
 * Server-side and the first client render agree (both render the
 * placeholder), so there is no hydration mismatch. Screen readers and
 * keyboard users are unaffected: the section mounts before it can be
 * interacted with.
 */
export function LazyMount({
  children,
  minHeight = 240,
  label,
}: {
  children: ReactNode;
  minHeight?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted || !ref.current) return;
    const el = ref.current;
    if (typeof IntersectionObserver === "undefined") return; // SSR / ancient browser: stays placeholder
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  if (mounted) return <>{children}</>;
  return (
    <div
      ref={ref}
      style={{ minHeight }}
      role="presentation"
      aria-label={label ? `${label} (loads on scroll)` : undefined}
    />
  );
}
