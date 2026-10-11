"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder shown while a lazily-imported documentation section compiles
 * (next/dynamic loading state). Keeps the Documentation tab's layout stable
 * and communicates progress instead of a blank jump.
 */
export function DocsSectionSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={`Loading ${label}`}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <Skeleton className="skeleton-shimmer h-6 w-1/3" />
      <Skeleton className="skeleton-shimmer h-4 w-2/3" />
      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
        <Skeleton className="skeleton-shimmer h-20 rounded-lg" />
        <Skeleton className="skeleton-shimmer h-20 rounded-lg" />
        <Skeleton className="skeleton-shimmer h-20 rounded-lg" />
        <Skeleton className="skeleton-shimmer h-20 rounded-lg" />
      </div>
      <Skeleton className="skeleton-shimmer h-40 rounded-lg" />
    </section>
  );
}
