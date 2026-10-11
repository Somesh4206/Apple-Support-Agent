"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Styling shared with the inline "/" hint in the conversation explorer.
 */
const KBD_CLASS =
  "inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-300 bg-zinc-50 px-1.5 font-mono text-[11px] leading-none text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

const SHORTCUTS: Array<{
  keys: string[];
  label: string;
  hint?: string;
}> = [
  {
    keys: ["/"],
    label: "Jump to search",
    hint: "Focuses the conversation explorer search box and selects its contents.",
  },
  {
    keys: ["←", "→"],
    label: "Previous / next page",
    hint: "Steps through explorer results while not typing in a field.",
  },
  {
    keys: ["?"],
    label: "Toggle this help",
    hint: "Opens or closes the keyboard shortcuts reference.",
  },
  {
    keys: ["Esc"],
    label: "Close overlays",
    hint: "Dismisses dialogs such as the chart lightbox or this help.",
  },
  {
    keys: ["Enter"],
    label: "Next match (find in doc)",
    hint: "Steps through find-in-document matches in the docs viewer; Shift+Enter goes back, Esc clears.",
  },
  {
    keys: ["j"],
    label: "Focus jump-to-turn",
    hint: "Inside an open thread dialog, focuses the turn-number input (threads of 3+ turns).",
  },
];

/**
 * Keyboard shortcuts reference — a "?" trigger button plus a "?" global key
 * listener. Rendered once by page.tsx (outside Suspense) so the shortcut
 * works in every dashboard state, including NOT_RUN.
 */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          // Typing "?" into the search box must stay literal.
          return;
        }
        if (
          target.closest(
            '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]',
          ) !== null
        ) {
          return;
        }
      }
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 gap-1.5 px-3 print:hidden"
          aria-label="Keyboard shortcuts (press question mark)"
          aria-keyshortcuts="?"
          title="Keyboard shortcuts — or press ?"
        >
          <Keyboard className="size-4" aria-hidden="true" />
          <span className="hidden lg:inline">Shortcuts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Quick ways to drive this dashboard without the mouse. Shortcuts are
            ignored while you are typing in a field.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1" aria-label="Shortcut list">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.label}
              className="flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{shortcut.label}</p>
                {shortcut.hint ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {shortcut.hint}
                  </p>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-1 pt-0.5">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className={KBD_CLASS} aria-hidden="true">
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-3 text-xs text-zinc-400 dark:text-zinc-500">
          The explorer also round-trips filters through the URL — copy the
          address bar to share exactly what you are looking at.
        </p>
      </DialogContent>
    </Dialog>
  );
}
