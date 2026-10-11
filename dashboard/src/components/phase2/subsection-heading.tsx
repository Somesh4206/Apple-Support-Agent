import type { LucideIcon } from "lucide-react";

interface SubsectionHeadingProps {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Phase 2 subsection heading (h3, one level below the section's SectionHeading):
 * smaller sibling of phase1/section-heading.tsx — emerald icon chip + title +
 * anchor link + description, same visual language.
 */
export function SubsectionHeading({
  id,
  title,
  description,
  icon: Icon,
}: SubsectionHeadingProps) {
  return (
    <div className="group/subsection space-y-1">
      <h3
        id={id}
        className="flex scroll-mt-24 items-center gap-2.5 text-base font-semibold tracking-tight sm:text-lg"
      >
        {Icon ? (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Icon className="size-3.5" />
          </span>
        ) : null}
        {title}
        <a
          href={`#${id}`}
          className="ml-1 inline-flex size-6 items-center justify-center rounded-md text-zinc-300 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 group-hover/subsection:opacity-100 dark:text-zinc-600 print:hidden"
          aria-label={`Link to the ${title} subsection`}
          title={`Copy or share a link to “${title}”`}
        >
          <span aria-hidden="true" className="text-[10px] font-bold">§</span>
        </a>
      </h3>
      {description ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}
