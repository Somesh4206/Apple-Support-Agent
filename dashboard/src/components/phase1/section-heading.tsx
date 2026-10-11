import type { LucideIcon } from "lucide-react";
import { Link2 } from "lucide-react";

interface SectionHeadingProps {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/** Shared section heading: emerald icon chip + title + anchor link + description. */
export function SectionHeading({
  id,
  title,
  description,
  icon: Icon,
}: SectionHeadingProps) {
  return (
    <div className="group/heading space-y-1">
      <h2
        id={id}
        className="flex scroll-mt-24 items-center gap-2.5 text-lg font-semibold tracking-tight sm:text-xl"
      >
        {Icon ? (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        {title}
        {/* Anchor link: appears on heading hover/focus; copies nothing, it
            navigates to #id so the section is deep-linkable. */}
        <a
          href={`#${id}`}
          className="ml-1 inline-flex size-7 items-center justify-center rounded-md text-zinc-300 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 group-hover/heading:opacity-100 dark:text-zinc-600 print:hidden"
          aria-label={`Link to the ${title} section`}
          title={`Copy or share a link to “${title}”`}
        >
          <Link2 className="size-3.5" aria-hidden="true" />
        </a>
      </h2>
      {description ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}
