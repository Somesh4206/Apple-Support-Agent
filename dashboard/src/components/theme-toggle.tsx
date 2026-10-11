"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** No-op store subscription — the snapshot never changes after hydration. */
const emptySubscribe = () => () => {};

/**
 * Hydration-safe "is mounted" flag: false on the server and during the first
 * client render, true afterwards — without setState-in-effect.
 */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Color-theme cycler: light → dark → system → light.
 * `theme` is the stored preference (may be "system"); `resolvedTheme` is what
 * is actually rendered once the system preference has been resolved.
 */
const NEXT_MODE = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

type ThemeMode = keyof typeof NEXT_MODE;

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "light",
  dark: "dark",
  system: "system",
};

function normalizeTheme(value: string | undefined): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Header icon button that cycles the color theme. Until hydration completes,
 * next-themes cannot know the active theme, so a neutral pulsing placeholder
 * is rendered — identical markup on server and first client render, which
 * keeps hydration stable.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useIsHydrated();

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        aria-label="Toggle color theme"
        tabIndex={-1}
      >
        <span
          className="size-4 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
          aria-hidden="true"
        />
      </Button>
    );
  }

  const current = normalizeTheme(theme);
  const next = NEXT_MODE[current];
  const resolvedNote =
    current === "system" && resolvedTheme !== undefined
      ? ` (${resolvedTheme})`
      : "";

  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-9 shrink-0"
      onClick={() => setTheme(next)}
      aria-label={`Toggle color theme — currently ${MODE_LABEL[current]}${resolvedNote}, switching to ${MODE_LABEL[next]}`}
      title={`Theme: ${MODE_LABEL[current]}${resolvedNote} — click to use ${MODE_LABEL[next]}`}
    >
      <Icon
        className={cn(
          "size-4",
          current === "light" && "text-amber-500 dark:text-amber-400",
          current === "dark" && "text-zinc-600 dark:text-zinc-100",
          current === "system" && "text-zinc-500 dark:text-zinc-400",
        )}
        aria-hidden="true"
      />
    </Button>
  );
}
