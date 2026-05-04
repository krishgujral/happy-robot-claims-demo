import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, X, ChevronRight, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MOCK_MODE = true;
const MOCK_CALL_DURATION_MS = 12000;

type Status = "on_track" | "flagged" | "parts_delayed" | "exception" | "stale" | "calling_now";

type Claim = {
  claim_id: string;
  ro_number: string;
  vehicle: string;
  shop: string;
  service_writer: string;
  last_update: string;
  status: Status;
  in_inbox: boolean;
  supplement_amount?: number;
};

const SEED_CLAIMS: Claim[] = [
  { claim_id: "CL-44106", ro_number: "RO-284756", vehicle: "2019 Toyota Camry", shop: "Westside Collision", service_writer: "David", last_update: "Just now", status: "flagged", supplement_amount: 1200, in_inbox: true },
  { claim_id: "CL-43941", ro_number: "RO-283901", vehicle: "2020 Subaru Outback", shop: "Coastline Body Shop", service_writer: "Jess", last_update: "4 days ago", status: "stale", in_inbox: true },
  { claim_id: "CL-43987", ro_number: "RO-284012", vehicle: "2021 Ford F-150", shop: "Premier Auto Repair", service_writer: "Mike", last_update: "2 hrs ago", status: "on_track", in_inbox: false },
  { claim_id: "CL-43702", ro_number: "RO-283455", vehicle: "2023 Tesla Model Y", shop: "Riverside Body & Paint", service_writer: "Tony", last_update: "1 hr ago", status: "on_track", in_inbox: false },
  { claim_id: "CL-43850", ro_number: "RO-283788", vehicle: "2022 Honda Civic", shop: "AutoNation Collision", service_writer: "Carlos", last_update: "6 hrs ago", status: "parts_delayed", in_inbox: true },
  { claim_id: "CL-44012", ro_number: "RO-284601", vehicle: "2021 Chevy Silverado", shop: "Maaco", service_writer: "Brian", last_update: "1 day ago", status: "exception", in_inbox: true },
  { claim_id: "CL-43775", ro_number: "RO-283612", vehicle: "2022 Hyundai Tucson", shop: "Caliber Collision", service_writer: "Linda", last_update: "3 hrs ago", status: "on_track", in_inbox: false },
  { claim_id: "CL-43698", ro_number: "RO-283399", vehicle: "2020 Nissan Altima", shop: "Service King", service_writer: "Eduardo", last_update: "5 days ago", status: "stale", in_inbox: true },
];

const STATUS_LABEL: Record<Status, string> = {
  on_track: "On track",
  flagged: "Flagged",
  parts_delayed: "Parts delayed",
  exception: "Exception",
  stale: "Stale",
  calling_now: "Calling now",
};

const STATUS_CLASS: Record<Status, string> = {
  on_track: "bg-emerald-50 text-emerald-700 border-emerald-200",
  flagged: "bg-amber-50 text-amber-800 border-amber-200",
  parts_delayed: "bg-amber-50 text-amber-800 border-amber-200",
  exception: "bg-red-50 text-red-700 border-red-200",
  stale: "bg-zinc-100 text-zinc-600 border-zinc-200",
  calling_now: "bg-blue-50 text-blue-700 border-blue-200",
};

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded-full", STATUS_CLASS[status])}>
      {status === "calling_now" && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function fmtTimer(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

const Index = () => {
  const [tab, setTab] = useState<"inbox" | "all">("inbox");
  const [claims, setClaims] = useState<Claim[]>(SEED_CLAIMS);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [callStart, setCallStart] = useState<number>(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [highlightFading, setHighlightFading] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (callingId) {
      timerRef.current = window.setInterval(() => setNow(Date.now()), 1000);
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }
  }, [callingId]);

  const visible = useMemo(
    () => (tab === "inbox" ? claims.filter((c) => c.in_inbox) : claims),
    [tab, claims]
  );

  function handleTrigger(claimId: string) {
    setCallingId(claimId);
    setCallStart(Date.now());
    setNow(Date.now());
    setHighlightId(claimId);
    setHighlightFading(false);

    window.setTimeout(() => {
      setClaims((prev) =>
        prev.map((c) =>
          c.claim_id === claimId
            ? { ...c, status: "on_track", last_update: "Just now" }
            : c
        )
      );
      setCallingId(null);
      setFreshId(claimId);
      // start fade
      window.setTimeout(() => setHighlightFading(true), 50);
      window.setTimeout(() => {
        setHighlightId(null);
        setHighlightFading(false);
      }, 3000);
    }, MOCK_CALL_DURATION_MS);
  }

  function handleReview(claimId: string) {
    setSelectedId(claimId);
    setPanelOpen(true);
  }

  const selected = claims.find((c) => c.claim_id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Top bar */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded flex items-center justify-center text-[11px] font-semibold text-white" style={{ backgroundColor: "hsl(var(--primary))" }}>
              CC
            </div>
            <h1 className="text-sm font-semibold tracking-tight">ClaimCadence</h1>
          </div>
          <div className="text-xs text-zinc-500">Sarah Chen · Auto claims</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">My queue</h2>
          <div className="inline-flex border border-zinc-200 rounded-md p-0.5 bg-zinc-50">
            <button
              onClick={() => setTab("inbox")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded transition-colors",
                tab === "inbox" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              Exception Inbox
            </button>
            <button
              onClick={() => setTab("all")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded transition-colors",
                tab === "all" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              All claims
            </button>
          </div>
        </div>

        <div className="border border-zinc-200 rounded-md overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wide text-zinc-500 font-medium w-[18%]">Claim</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wide text-zinc-500 font-medium">Vehicle / shop</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wide text-zinc-500 font-medium w-[16%]">Last update</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wide text-zinc-500 font-medium w-[14%]">Status</th>
                <th className="text-right px-4 py-2.5 text-xs uppercase tracking-wide text-zinc-500 font-medium w-[18%]">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const isCalling = callingId === c.claim_id;
                const isHighlighted = highlightId === c.claim_id;
                const isFresh = freshId === c.claim_id && c.last_update === "Just now";
                const isStale = c.last_update.includes("days ago");

                let lastUpdateText: React.ReactNode = c.last_update;
                let lastUpdateClass = "text-zinc-500";
                if (isCalling) {
                  lastUpdateText = "In progress";
                  lastUpdateClass = "text-blue-700";
                } else if (isFresh) {
                  lastUpdateClass = "text-emerald-700";
                } else if (isStale) {
                  lastUpdateClass = "text-amber-700";
                }

                return (
                  <tr
                    key={c.claim_id}
                    className={cn(
                      "border-b border-zinc-100 last:border-b-0 transition-colors duration-1000",
                      isHighlighted && !highlightFading && "bg-blue-50 border-l-2 border-l-blue-500",
                      isHighlighted && highlightFading && "bg-blue-50/30"
                    )}
                    style={{ height: 64 }}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="font-mono text-sm text-zinc-900">{c.claim_id}</div>
                      <div className="font-mono text-xs text-zinc-500 mt-0.5">RO #{c.ro_number.replace("RO-", "")}</div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="text-sm font-semibold text-zinc-900">{c.vehicle}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{c.shop} · {c.service_writer}</div>
                    </td>
                    <td className={cn("px-4 py-3 align-middle text-sm", lastUpdateClass)}>
                      {lastUpdateText}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusPill status={isCalling ? "calling_now" : c.status} />
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      {isCalling ? (
                        <span className="font-mono text-sm text-zinc-500 italic">
                          {fmtTimer(now - callStart)}
                        </span>
                      ) : c.status === "stale" ? (
                        <button
                          onClick={() => handleTrigger(c.claim_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors"
                          style={{ backgroundColor: "hsl(var(--primary))" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--primary-hover))")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--primary))")}
                        >
                          <Phone className="w-3 h-3" />
                          Trigger status check
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReview(c.claim_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors"
                        >
                          Review
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px] p-0 overflow-y-auto">
          {selected && <DrillDown claim={selected} onClose={() => setPanelOpen(false)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
};

function DrillDown({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const isCamry = claim.claim_id === "CL-44106";

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-200 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold text-zinc-900">{claim.claim_id}</span>
              <StatusPill status={claim.status} />
              {claim.supplement_amount && <span className="text-xs text-zinc-500">supplement</span>}
            </div>
            <div className="text-sm text-zinc-600">{claim.vehicle} · {claim.shop}</div>
          </div>
          <div className="flex items-center gap-2">
            {claim.supplement_amount && (
              <button
                onClick={() => toast.success("Supplement approved · syncing to ClaimCenter", { duration: 3000 })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors whitespace-nowrap"
                style={{ backgroundColor: "hsl(var(--primary))" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--primary-hover))")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--primary))")}
              >
                <Check className="w-3 h-3" />
                Approve ${claim.supplement_amount.toLocaleString()}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">Note written to claim file</h3>
          <div className="border border-zinc-200 rounded-md p-4 bg-white">
            <div className="font-mono text-xs text-zinc-500 mb-0.5">
              Status check · {isCamry ? "5/3 at 10:42 AM" : "Today"}
            </div>
            <div className="font-mono text-xs text-zinc-500 mb-3">AI assistant on behalf of Sarah Chen</div>
            {isCamry ? (
              <p className="text-sm text-zinc-800 leading-relaxed">
                Spoke with David, service writer at Westside Collision, regarding 2019 Toyota Camry. Vehicle checked in 4/29, teardown completed 5/2.{" "}
                <span className="bg-amber-50 text-amber-900 px-1">
                  Supplement identified during teardown: $1,200 for inner quarter panel damage and rear bumper sensor
                </span>{" "}
                not visible at initial inspection. Parts ordered for supplemental items, ETA 5/6. New target completion: 5/12. Action required: supplement approval before parts ship.
              </p>
            ) : (
              <p className="text-sm text-zinc-800 leading-relaxed">
                Spoke with {claim.service_writer} at {claim.shop} regarding {claim.vehicle}. Repair progressing per estimate. No new issues reported.
              </p>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">Extracted fields</h3>
          <div className="border border-zinc-200 rounded-md p-3">
            {(isCamry
              ? [
                  ["Checked in", "4/29"],
                  ["Teardown", "Complete"],
                  ["Parts status", "Ordered, pending"],
                  ["Parts ETA", "5/6"],
                  ["Supplement", "$1,200", true],
                  ["Percent complete", "45%"],
                  ["Target completion", "5/12"],
                  ["Spoke with", "David (service writer)"],
                ]
              : [
                  ["Shop", claim.shop],
                  ["Spoke with", claim.service_writer],
                  ["Last update", claim.last_update],
                  ["Status", STATUS_LABEL[claim.status]],
                ]
            ).map(([label, value, highlight]) => (
              <div
                key={label as string}
                className={cn(
                  "grid grid-cols-2 gap-3 py-2 text-sm border-b border-zinc-100 last:border-b-0",
                  highlight && "bg-amber-50 -mx-3 px-3 rounded"
                )}
              >
                <div className="text-xs uppercase tracking-wide text-zinc-500 font-medium self-center">{label}</div>
                <div className="font-mono text-sm text-zinc-900">{value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Index;
