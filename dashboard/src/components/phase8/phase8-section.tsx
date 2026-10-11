"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  MonitorSmartphone,
  Terminal,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SectionHeading } from "@/components/phase1/section-heading";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";

/** The three captured Streamlit views (1400×900 browser screenshots taken
 *  against the live app + live agent service). */
const SCREENSHOTS: {
  name: "initial" | "auto" | "escalate";
  tab: string;
  title: string;
  caption: string;
  alt: string;
}[] = [
  {
    name: "initial",
    tab: "initial",
    title: "Initial view",
    caption:
      "The app on load: the 2017-era historical-evidence disclaimer, the live service health chip, the message box with golden-set example chips, and the policy-rules sidebar. Nothing has been asked yet.",
    alt: "Streamlit app initial view: disclaimer banner, service health status, message input with example chips, and a sidebar listing the five escalation rules.",
  },
  {
    name: "auto",
    tab: "auto",
    title: "Auto-handle decision",
    caption:
      "An auto-handle path: the decision banner, predicted intent and confidence, gates, the rule trace (no rule fired), the grounded reply ready to send with its heuristic scores, and the expandable evidence behind it.",
    alt: "Streamlit app showing an auto-handle decision: green decision banner, intent metrics, generated reply with grounding scores, and evidence expander.",
  },
  {
    name: "escalate",
    tab: "escalate",
    title: "Escalate decision",
    caption:
      "An escalate path: the red decision banner, the rules that fired with their details, and the structured human handoff — suggested public acknowledgment (never sent automatically), note for the agent, and top evidence for review. No LLM call was spent.",
    alt: "Streamlit app showing an escalate decision: red decision banner, fired rules with details, and the structured human handoff bundle.",
  },
];

const IMAGE_SIZE = { width: 1400, height: 900 };

/**
 * "Phase 8 — Streamlit app" section. Static content: the Streamlit client
 * is a thin UI over the SAME live agent service as the dashboard's Phase 7
 * console (one code path — no ML/LLM code in the app), how to run it, the
 * AppTest verification, and the three captured views in tabs with a
 * lightbox. Includes the honest note that the app binds to 127.0.0.1:8501
 * because the sandbox gateway cannot route Streamlit's websocket/static
 * assets — the Phase 7 console above is the same agent loop, exposed.
 */
export function Phase8Section() {
  return (
    <section aria-labelledby="phase8-heading" className="space-y-4">
      <SectionHeading
        id="phase8-heading"
        icon={MonitorSmartphone}
        title="Phase 8 — Streamlit app"
        description="The assignment's app deliverable: a Streamlit console for the unified agent. It is deliberately thin — every prediction, retrieval, policy decision and draft comes from the same live service the Phase 7 evaluation drove, so the app, the dashboard console and the offline numbers can never drift apart."
      />

      <div className="space-y-8 sm:space-y-10">
        {/* ---- what the app is + how to run it ---- */}
        <section aria-labelledby="phase8-what-heading" className="space-y-4">
          <SubsectionHeading
            id="phase8-what-heading"
            icon={Terminal}
            title="One agent, one code path, two consoles"
            description="streamlit_app.py contains no ML code and no LLM access — it is a HTTP client for mini-services/retrieval-service (port 3030), the same service this dashboard's Phase 7 console calls. If the service is down, the app says so instead of pretending."
          />

          <Card className="gap-0">
            <CardHeader className="border-b">
              <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span>Run it locally</span>
                <span className="text-[10px] font-normal uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  with the retrieval service running
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                The worker loads lazily on the first question (~15 s); the app
                polls the service health and shows a warm-up state while it
                loads.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-4 space-y-3">
              <code className="block overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-1 dark:ring-zinc-800/80">
                cd mini-services/retrieval-service && bun run dev
              </code>
              <code className="block overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-1 dark:ring-zinc-800/80">
                cd hiver-support-agent && streamlit run streamlit_app.py
                --server.port 8501 --server.headless true
              </code>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                    <CheckCircle2
                      className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Verified with Streamlit AppTest
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
                    The app was exercised programmatically (streamlit.testing
                    AppTest): no exceptions raised, and both decision paths —
                    auto-handle and escalate — render their full contracts.
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                    <CheckCircle2
                      className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Verified in a live browser
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
                    The three screenshots below were captured against the
                    running app with the live agent service behind it — the
                    same warm-up, decisions and evidence the AppTest asserted.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ---- the screenshots ---- */}
        <section aria-labelledby="phase8-shots-heading" className="space-y-4">
          <SubsectionHeading
            id="phase8-shots-heading"
            icon={MonitorSmartphone}
            title="The app, captured live"
            description="Three views of the running app — the initial screen, an auto-handle decision and an escalate decision. Click any screenshot for the full-size view."
          />

          <Card className="gap-0">
            <CardHeader className="border-b">
              <CardTitle className="text-sm">
                Captured views (127.0.0.1:8501)
              </CardTitle>
              <CardDescription className="text-xs">
                Served from this dashboard&rsquo;s public/ folder as
                PNG screenshots of the live app.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-4">
              <Tabs defaultValue="initial">
                <TabsList className="flex-wrap">
                  {SCREENSHOTS.map((shot) => (
                    <TabsTrigger key={shot.name} value={shot.tab}>
                      {shot.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {SCREENSHOTS.map((shot) => (
                  <TabsContent key={shot.name} value={shot.tab} className="mt-4">
                    <ScreenshotFigure shot={shot} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* ---- the honest deployment note ---- */}
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/70 dark:bg-amber-950/20">
          <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
              <TriangleAlert
                className="size-4 shrink-0 text-amber-500 dark:text-amber-400"
                aria-hidden="true"
              />
              Where the app actually runs — an honest note
            </CardTitle>
            <CardDescription className="text-xs text-amber-800/90 dark:text-amber-300/80">
              The Streamlit app binds to 127.0.0.1:8501 and is an
              assignment-local deliverable.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              This sandbox exposes a single port through a gateway that routes
              by path — Streamlit&rsquo;s websocket handshake and static assets
              cannot carry the gateway&rsquo;s routing parameters, so the app
              cannot be embedded or reached through the public URL. The
              screenshots above and the{" "}
              <a
                href="#phase7-demo-heading"
                className="font-medium underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-100"
              >
                Phase 7 live agent console
              </a>{" "}
              on this dashboard run the exact same agent loop
              (mini-services/retrieval-service, port 3030) and are fully
              interactive — that console is the same one code path, exposed to
              you here.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              >
                streamlit_app.py · thin client
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              >
                one code path: the live service
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              >
                127.0.0.1:8501 · assignment-local
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One screenshot: caption + framed image + lightbox                   */
/* ------------------------------------------------------------------ */

function ScreenshotFigure({
  shot,
}: {
  shot: (typeof SCREENSHOTS)[number];
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = `/phase8-streamlit-${shot.name}.png`;

  return (
    <figure className="min-w-0 space-y-2.5">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Open the ${shot.title} screenshot in a larger view`}
            className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-emerald-500 dark:focus-visible:ring-offset-zinc-900"
          >
            {failed ? (
              <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="px-4 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Screenshot unavailable — the{" "}
                  <span className="font-medium">{shot.title}</span> image
                  could not be loaded.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* White plate: the browser screenshot has a light UI, so it
                    stays legible in dark mode on a white pad. */}
                <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:rounded-lg dark:border-zinc-800 dark:p-2">
                  <img
                    src={url}
                    alt={shot.alt}
                    width={IMAGE_SIZE.width}
                    height={IMAGE_SIZE.height}
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    className="h-auto w-full"
                  />
                </div>
                {!loaded ? (
                  <Skeleton
                    className="skeleton-shimmer absolute inset-0 z-10 rounded-md dark:rounded-lg"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-500 dark:group-hover:text-zinc-400">
              Click to enlarge · full 1400×900 PNG
            </p>
          </button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Streamlit app — {shot.title}</DialogTitle>
            <DialogDescription>{shot.caption}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto">
            <div className="rounded-md border border-zinc-200 bg-white dark:rounded-lg dark:border-zinc-800 dark:p-2">
              <img
                src={url}
                alt={shot.alt}
                width={IMAGE_SIZE.width}
                height={IMAGE_SIZE.height}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button asChild variant="outline" size="sm" className="h-11">
              <a href={url} download={`phase8-streamlit-${shot.name}.png`}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open / download PNG
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <figcaption className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {shot.caption}
      </figcaption>
    </figure>
  );
}
