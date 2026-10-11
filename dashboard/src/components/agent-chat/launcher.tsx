"use client";

import { Headset } from "lucide-react";

/**
 * The floating chat launcher — fixed bottom-right, emerald, with an amber
 * attention dot that pulses until the panel is opened for the first time
 * (the "seen" flag is persisted by the parent, keyed in localStorage).
 *
 * Hidden (display:none) while the panel is open: the panel occupies the
 * same bottom-right corner. aria-expanded still reflects the state.
 */
export function AgentChatLauncher({
  open,
  showAttentionDot,
  onOpen,
}: {
  open: boolean;
  showAttentionDot: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open live agent chat"
      aria-expanded={open}
      title="Chat with the live support agent"
      className={
        open
          ? "hidden"
          : "fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform duration-150 hover:scale-105 hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-95 dark:bg-emerald-500 dark:shadow-emerald-500/20 dark:hover:bg-emerald-400 print:hidden"
      }
    >
      <Headset className="size-6" aria-hidden="true" />
      {showAttentionDot ? (
        <span
          aria-hidden="true"
          className="animate-in fade-in absolute -right-0.5 -top-0.5 flex size-3.5"
        >
          {/* amber pulse — drops once the panel has been opened (persisted) */}
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-amber-500 dark:border-zinc-950" />
        </span>
      ) : null}
    </button>
  );
}
