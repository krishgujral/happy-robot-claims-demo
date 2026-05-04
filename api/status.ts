// /api/status.ts — Vercel serverless function
// Polled by the React app every 3 sec while a call is in flight.
// Returns: { state: "pending" | "running" | "complete" | "failed", extracted?: {...} }
//
// Strategy: list recent runs for the workflow, find the most recent one matching the claim_id
// in its trigger payload, check status, and if completed, fetch the Extract node's outputs.
//
// Why list-and-filter instead of using a passed-in run_id?
//   - The /hooks/<id> endpoint doesn't reliably return a run_id in its response body.
//   - Listing recent runs for our (single) workflow is cheap and gives us the same answer.
//   - It also makes the React app stateless: it just polls with claim_id, no run_id to track.

const WORKFLOW_ID = "019def82-9a88-7d40-9d29-1ed8e9136da3";
const EXTRACT_NODE_PERSISTENT_ID = "019def82-9af5-7902-8bda-14b354df78ce"; // "Extract Repair Status"
const VOICE_AGENT_PERSISTENT_ID = "019def82-9adb-7468-a0d1-cd464be12f4b"; // "Body Shop Status Call"
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
  const claimId = url.searchParams.get("claim_id");
  if (!claimId) {
    return json({ error: "Missing claim_id query param" }, 400);
  }

  const auth = { Authorization: `Bearer ${apiKey}` };

  // 1. List recent runs for this workflow (paginated; we only need the most recent ~20)
  const runsRes = await fetch(
    `${API_BASE}/workflows/${WORKFLOW_ID}/runs?page_size=20&sort=desc`,
    { headers: auth }
  );
  if (!runsRes.ok) {
    return json(
      { error: "Failed to list runs", status: runsRes.status },
      502
    );
  }
  const runsBody = await runsRes.json();
  const runs: any[] = runsBody?.data || runsBody?.items || runsBody?.runs || [];

  // 2. Find the most recent run whose trigger payload matches our claim_id.
  //    Trigger params are stored on the run; field shape varies — check a few likely paths.
  const match = runs.find((r) => {
    const payload =
      r.trigger_payload || r.payload || r.input || r.trigger?.payload || {};
    return payload?.claim_id === claimId;
  });

  if (!match) {
    return json({ state: "pending" }, 200);
  }

  const runId = match.id || match.run_id;
  const runStatus = (match.status || "").toLowerCase();

  // 3. Map HR run status → our app's state machine
  if (runStatus === "failed" || runStatus === "canceled") {
    return json({ state: "failed", run_id: runId, hr_status: runStatus }, 200);
  }

  if (runStatus !== "completed" && runStatus !== "complete" && runStatus !== "succeeded") {
    return json({ state: "running", run_id: runId, hr_status: runStatus }, 200);
  }

  // 4. Run is done. Fetch the Extract node's outputs to hydrate the UI.
  const outputsRes = await fetch(
    `${API_BASE}/runs/${runId}/nodes?node_id=${EXTRACT_NODE_PERSISTENT_ID}`,
    { headers: auth }
  );

  let extracted: Record<string, unknown> | null = null;
  if (outputsRes.ok) {
    const outBody = await outputsRes.json();
    const nodeOutputs: any[] = outBody?.data || outBody?.items || outBody?.outputs || [];
    // The extract node has a single output object under "response"
    const first = nodeOutputs[0];
    if (first) {
      // The output_id can be used to fetch the full payload if needed
      const outputId = first.id || first.output_id;
      if (outputId) {
        const fullRes = await fetch(
          `${API_BASE}/runs/${runId}/outputs/${outputId}`,
          { headers: auth }
        );
        if (fullRes.ok) {
          const fullBody = await fullRes.json();
          extracted =
            fullBody?.response ||
            fullBody?.data?.response ||
            fullBody?.output?.response ||
            fullBody?.data ||
            fullBody;
        }
      } else {
        extracted = first.response || first.output || first;
      }
    }
  }

  // 5. Optionally also fetch voice agent metadata (recording URL, duration, transcript)
  let callMeta: Record<string, unknown> | null = null;
  try {
    const sessRes = await fetch(`${API_BASE}/runs/${runId}/sessions`, {
      headers: auth,
    });
    if (sessRes.ok) {
      const sBody = await sessRes.json();
      const sessions: any[] = sBody?.data || sBody?.items || [];
      const s = sessions[0];
      if (s) {
        callMeta = {
          duration_seconds: s.duration || s.duration_seconds,
          recording_url: s.recording_url,
          session_id: s.id || s.session_id,
        };
      }
    }
  } catch {
    /* non-fatal */
  }

  return json(
    {
      state: "complete",
      run_id: runId,
      extracted,
      call_meta: callMeta,
    },
    200
  );
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
