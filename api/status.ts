// /api/status.ts — Vercel serverless function
// Polled by the React app every 3 sec while a call is in flight.
//
// Query: ?run_id=<uuid>
// Returns: { state: "running" | "complete" | "failed", extracted?: {...}, call_meta?: {...} }

const EXTRACT_NODE_PERSISTENT_ID = "019def82-9af5-7902-8bda-14b354df78ce";
const VOICE_AGENT_PERSISTENT_ID = "019def82-9adb-7468-a0d1-cd464be12f4b";
const API_BASE = "https://platform.happyrobot.ai/api/v2";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.HR_API_KEY;
  if (!apiKey) {
    return json({ error: "HR_API_KEY not configured" }, 500);
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  const debug = url.searchParams.get("debug") === "1";
  if (!runId) {
    return json({ error: "Missing run_id query param" }, 400);
  }

  const auth = { Authorization: `Bearer ${apiKey}` };

  // 1. Get the run record for top-level status
  const runRes = await fetch(`${API_BASE}/runs/${runId}`, { headers: auth });
  if (!runRes.ok) {
    return json(
      { error: "Failed to fetch run", status: runRes.status, run_id: runId },
      502
    );
  }
  const runBody = await runRes.json();
  const run = runBody?.data || runBody;
  const runStatus = (run?.status || "").toLowerCase();

  if (runStatus === "failed" || runStatus === "canceled") {
    return json({ state: "failed", run_id: runId, hr_status: runStatus }, 200);
  }

  // 2. Per-node outputs — find Extract node and check its status
  const nodesRes = await fetch(`${API_BASE}/runs/${runId}/nodes`, { headers: auth });
  if (!nodesRes.ok) {
    return json({ state: "running", run_id: runId, hr_status: runStatus }, 200);
  }
  const nodesBody = await nodesRes.json();
  const nodes: any[] = Array.isArray(nodesBody) ? nodesBody : nodesBody?.data || nodesBody?.items || [];

  const extractNode = nodes.find(
    (n) =>
      n.node_persistent_id === EXTRACT_NODE_PERSISTENT_ID ||
      n.persistent_id === EXTRACT_NODE_PERSISTENT_ID
  );
  const voiceNode = nodes.find(
    (n) =>
      n.node_persistent_id === VOICE_AGENT_PERSISTENT_ID ||
      n.persistent_id === VOICE_AGENT_PERSISTENT_ID
  );

  const extractStatus = (extractNode?.status || "").toLowerCase();
  if (extractStatus !== "succeeded" && extractStatus !== "completed") {
    return json(
      {
        state: "running",
        run_id: runId,
        hr_status: runStatus,
        extract_status: extractStatus || "pending",
      },
      200
    );
  }

  // 3. Extract done — fetch its full output payload.
  // Confirmed shape: outBody.data.data.response = { checked_in: "true", parts_status: "all_in", ... }
  const extractOutputId = extractNode.output_id || extractNode.id;
  let extracted: Record<string, unknown> | null = null;
  let extractDebug: unknown = null;
  if (extractOutputId) {
    const outRes = await fetch(
      `${API_BASE}/runs/${runId}/outputs/${extractOutputId}`,
      { headers: auth }
    );
    if (outRes.ok) {
      const outBody = await outRes.json();
      if (debug) extractDebug = outBody;
      const rawExtracted =
        outBody?.data?.data?.response ||
        outBody?.response ||
        outBody?.data?.response ||
        outBody?.output?.response ||
        outBody?.payload?.response ||
        null;
      extracted = coerceExtracted(rawExtracted);
    }
  }

  // 4. Voice agent metadata (best-effort)
  let callMeta: Record<string, unknown> | null = null;
  const voiceOutputId = voiceNode?.output_id || voiceNode?.id;
  if (voiceOutputId) {
    try {
      const vRes = await fetch(
        `${API_BASE}/runs/${runId}/outputs/${voiceOutputId}`,
        { headers: auth }
      );
      if (vRes.ok) {
        const vBody = await vRes.json();
        const v = vBody?.data || vBody;
        callMeta = {
          duration_seconds: v?.duration,
          recording_url: v?.recording_url,
          session_id: v?.session_id,
        };
      }
    } catch {
      /* non-fatal */
    }
  }

  const payload: Record<string, unknown> = {
    state: "complete",
    run_id: runId,
    extracted,
    call_meta: callMeta,
  };
  if (debug) {
    payload.debug = {
      run: run,
      nodes: nodes,
      extract_output_id: extractOutputId,
      extract_output_raw: extractDebug,
    };
  }
  return json(payload, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// LLM extract emits booleans/numbers as strings ("true", "70"). Coerce so the
// React types in LatestCall (Index.tsx) actually match what we send.
function coerceExtracted(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = { ...raw };

  for (const k of ["checked_in", "teardown_complete", "supplement_needed"]) {
    const v = out[k];
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true") out[k] = true;
      else if (t === "false") out[k] = false;
    }
  }

  for (const k of ["supplement_amount_usd", "percent_complete"]) {
    const v = out[k];
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/[$,%\s]/g, ""));
      if (!Number.isNaN(n)) out[k] = n;
    }
  }

  return out;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
