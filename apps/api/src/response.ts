import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(res: Response, status: number, code: string, message: string, details: unknown[] = []) {
  return res.status(status).json({ success: false, error: { code, message, details } });
}
