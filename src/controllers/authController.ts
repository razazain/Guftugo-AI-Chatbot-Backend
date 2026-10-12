import { z } from "zod";
import type { RequestHandler } from "express";
import { UserModel } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import {
  loginUser,
  publicUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  updateUserLanguage,
} from "../services/authService";

const languageSchema = z.enum(["auto", "english", "roman-urdu"]);
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  preferredLanguage: languageSchema.optional(),
});
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    preferredLanguage: languageSchema.optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.preferredLanguage !== undefined,
    { message: "Provide at least one field to update." },
  );

function requestMetadata(req: Parameters<RequestHandler>[0]) {
  const userAgent = req.get("user-agent")?.slice(0, 512);
  const ipAddress = req.ip?.slice(0, 64);
  return { userAgent, ipAddress };
}

export const register: RequestHandler = asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const result = await registerUser(body, requestMetadata(req));
  res.status(201).json({ success: true, data: result });
});

export const login: RequestHandler = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const result = await loginUser(body, requestMetadata(req));
  res.json({ success: true, data: result });
});

export const refresh: RequestHandler = asyncHandler(async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const result = await rotateRefreshToken(
    body.refreshToken,
    requestMetadata(req),
  );
  res.json({ success: true, data: result });
});

export const logout: RequestHandler = asyncHandler(async (req, res) => {
  const body = refreshSchema.parse(req.body);
  await revokeRefreshToken(body.refreshToken);
  res.json({ success: true, data: { message: "Signed out successfully." } });
});

export const getMe: RequestHandler = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user!.id);
  if (!user || !user.isActive)
    throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  res.json({ success: true, data: { user: publicUser(user) } });
});

export const updateMe: RequestHandler = asyncHandler(async (req, res) => {
  const body = updateMeSchema.parse(req.body);
  const updates: {
    name?: string;
    preferredLanguage?: "auto" | "english" | "roman-urdu";
  } = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.preferredLanguage !== undefined)
    updates.preferredLanguage = body.preferredLanguage;
  const user = await UserModel.findByIdAndUpdate(
    req.user!.id,
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  res.json({ success: true, data: { user: publicUser(user) } });
});

export const setLanguage: RequestHandler = asyncHandler(async (req, res) => {
  const body = z.object({ preferredLanguage: languageSchema }).parse(req.body);
  const user = await updateUserLanguage(req.user!.id, body.preferredLanguage);
  res.json({ success: true, data: { user } });
});
