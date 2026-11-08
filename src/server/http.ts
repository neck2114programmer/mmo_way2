import { NextResponse, type NextRequest } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Код ошибки PostgreSQL (в т.ч. из DrizzleQueryError.cause). */
export function pgCode(e: unknown): string | undefined {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code ?? x?.cause?.code;
}

const CONN_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "57P01", "57P03", "28P01", "3D000"]);

export function isDbDown(e: unknown): boolean {
  const c = pgCode(e);
  if (c && (CONN_CODES.has(c) || c.startsWith("08"))) return true;
  const m = String((e as Error)?.message ?? "");
  return /Connection terminated|timeout exceeded when trying to connect|ECONNREFUSED/i.test(m) || /ECONNREFUSED/.test(String((e as { cause?: Error })?.cause?.message ?? ""));
}

/** Единая обработка ошибок: наружу — только понятные сообщения, без системных деталей. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      return json({ error: e.code, message: e.message, fields: e.fields }, e.status, e.headers);
    }
    console.error("[api] error:", pgCode(e) ?? (e as Error)?.name);
    if (isDbDown(e)) {
      return json({ error: "db_unavailable", message: "База данных недоступна. Изменения не сохранены — попробуйте позже." }, 503);
    }
    return json({ error: "internal", message: "Внутренняя ошибка сервера. Попробуйте позже." }, 500);
  }
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 32_000) throw new ApiError(413, "too_large", "Слишком большой запрос.");
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* ниже */
  }
  throw new ApiError(400, "bad_json", "Некорректное тело запроса.");
}

/** Защита от CSRF для изменяющих запросов: Origin / Sec-Fetch-Site должны указывать на тот же сайт (плюс SameSite=Lax у cookie). */
export function assertSameOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    let oh = "";
    try { oh = new URL(origin).host; } catch { /* неверный Origin */ }
    if (!host || oh !== host) throw new ApiError(403, "csrf", "Запрос отклонён (чужой источник).");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError(403, "csrf", "Запрос отклонён (чужой источник).");
}

export function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  const ip = (xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) ?? "unknown";
  return ip.trim().slice(0, 64) || "unknown";
}

export function isHttps(req: NextRequest): boolean {
  const env = process.env.COOKIE_SECURE;
  if (env === "true") return true;
  if (env === "false") return false;
  return (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
}
