import type { RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { sendChatMessage, streamChatMessage } from "../services/chatService";
import { AppError } from "../utils/AppError";
import { logger } from "../config/logger";

const chatBodySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(15000, "Message is too long."),
  conversationId: z.string().optional(),
  language: z.enum(["auto", "english", "roman-urdu"]).optional(),
  documentIds: z.array(z.string().length(24)).max(5).optional(),
  webSearch: z.boolean().optional(),
});

export const sendMessage: RequestHandler = asyncHandler(async (req, res) => {
  const body = chatBodySchema.parse(req.body);
  const data = await sendChatMessage({ userId: req.user!.id, ...body });
  res.json({ success: true, data });
});

export const streamMessage: RequestHandler = asyncHandler(
  async (req, res, _next) => {
    const body = chatBodySchema.parse(req.body);
    const controller = new AbortController();
    let disconnected = false;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, payload: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    res.on("close", () => {
      if (!res.writableEnded) {
        disconnected = true;
        controller.abort();
      }
    });

    // Keep long reasoning/model startup intervals alive through proxies and hosting layers.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
    }, 15000);
    heartbeat.unref?.();

    sendEvent("start", { message: "Generating response." });
    try {
      const result = await streamChatMessage(
        { userId: req.user!.id, ...body },
        (token) => sendEvent("token", { token }),
        controller.signal,
        (meta) => sendEvent("meta", meta),
      );
      sendEvent("done", result);
      if (!disconnected && !res.writableEnded) res.end();
    } catch (error) {
      if (disconnected) return;
      logger.error({
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        errorCode: error instanceof AppError ? error.code : undefined,
      }, 'Chat streaming request failed');
      if (error instanceof AppError) {
        sendEvent("error", { code: error.code, message: error.message });
        res.end();
        return;
      }
      // Once SSE headers are sent, errors must be returned as SSE events, not JSON.
      sendEvent("error", {
        code: "STREAM_FAILED",
        message: "The response was interrupted. Please retry your message.",
      });
      res.end();
      // Provider details stay server-side; see logs for the underlying cause.
    } finally {
      clearInterval(heartbeat);
    }
  },
);
