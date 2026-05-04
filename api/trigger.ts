// /api/trigger.ts — Vercel serverless function
// Receives a click from the React app, fires the HappyRobot workflow.
//
// POST body: { claim_id, ro_number, shop_phone, shop_name, customer_vehicle, service_writer_name, carrier_name }
// Response:  { run_id }                    or { error }

const WORKFLOW_HOOK_URL =
  "https://workflows.platform.happyrobot.ai/hooks/019def82-9a88-7d40-9d29-1ed8e9136da3";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight (Lovable hosted on a different origin than Vercel functions)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.HR_API_KEY;
  if (!apiKey) {
    return json({ error: "HR_API_KEY not configured on server" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const required = [
    "claim_id",
    "ro_number",
    "shop_phone",
    "shop_name",
    "customer_vehicle",
    "service_writer_name",
    "carrier_name",
  ];
  for (const k of required) {
    if (!body[k] || typeof body[k] !== "string") {
      return json({ error: `Missing or invalid field: ${k}` }, 400);
    }
  }

  // Fire the workflow. The hook URL accepts the trigger params directly as JSON body.
  const hrRes = await fetch(WORKFLOW_HOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const hrText = await hrRes.text();

  if (!hrRes.ok) {
    return json(
      {
        error: "HappyRobot trigger failed",
        status: hrRes.status,
        details: hrText.slice(0, 500),
      },
      502
    );
  }

  // The hook returns a JSON object with run identifying info. Pass through what we can find.
  let parsed: any = null;
  try {
    parsed = JSON.parse(hrText);
  } catch {
    // hook returned non-JSON — still consider it a success since 2xx came back
  }

  const runId =
    parsed?.run_id ||
    parsed?.runId ||
    parsed?.id ||
    parsed?.data?.run_id ||
    null;

  return json({ run_id: runId, raw: parsed }, 200);
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
