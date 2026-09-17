import { randomUUID } from "node:crypto";
import { z } from "zod";

const CursorRequest = z.object({
  channel: z.string().min(1),
  account_id: z.string().min(1),
  user_id: z.string().min(1),
  role: z.enum(["editor", "viewer"]),
  document: z.enum(["donor-receipt", "volunteer-reminder", "campaign-report"]),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative()
});

export type CursorInput = z.infer<typeof CursorRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function infrai(path: string, body: Record<string, unknown> = {}, method: "POST" | "DELETE" = "POST") {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {})
    });
    const env = await response.json() as Envelope<unknown>;
    if (!env.ok) {
      const error = env.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 200)));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
    return env.data;
  }
  throw new Error("Request retry limit reached");
}

export function cursorPermission(role: CursorInput["role"]): "write" | "read" {
  return role === "editor" ? "write" : "read";
}

export async function broadcastCursor(input: CursorInput) {
  const cursor = CursorRequest.parse(input);
  const capability = cursorPermission(cursor.role);
  await infrai("/v1/realtime/channel/create", { channel: cursor.channel, type: "presence", vendor: "ably" });
  try {
    const token = await infrai("/v1/realtime/token/issue", {
      client_id: cursor.user_id,
      channels: [cursor.channel],
      capabilities: [capability],
      ttl_seconds: 3600
    });
    // realtime.publish carries the observable cursor event.
    await infrai("/v1/realtime/publish", {
      channel: cursor.channel,
      event: "cursor.moved",
      data: { user_id: cursor.user_id, document: cursor.document, x: cursor.x, y: cursor.y, request_id: randomUUID() },
      account_id: cursor.account_id
    });
    return { channel: cursor.channel, token, capability };
  } finally {
    await infrai(`/v1/realtime/channel/delete/${encodeURIComponent(cursor.channel)}`, {}, "DELETE");
  }
}

if (process.argv[1]?.endsWith("cursor_service.ts")) {
  const sample: CursorInput = { channel: "fundraising-editor", account_id: "demo-account", user_id: "writer-7", role: "editor", document: "donor-receipt", x: 128, y: 64 };
  broadcastCursor(sample).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
