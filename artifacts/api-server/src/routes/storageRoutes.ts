import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { generateMealPhotoUploadUrl } from "../lib/objectStorage";
import { getStorageClient } from "../lib/storage";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

const UploadUrlSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
});

router.post("/storage/upload-url", async (req, res) => {
  const parsed = UploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  try {
    const { uploadUrl, objectKey } = await generateMealPhotoUploadUrl(parsed.data.userId);
    return res.json({ uploadUrl, objectKey, publicUrl: `/api/storage/objects/${objectKey}` });
  } catch {
    return res.status(503).json({ error: "Storage unavailable" });
  }
});

// Server-side upload: accepts base64 image, saves via storage client, returns publicUrl.
// More reliable than signed-URL PUT from mobile (avoids blob-fetch issues in Expo).
router.post("/storage/upload", async (req, res) => {
  const parsed = z.object({
    userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
    imageBase64: z.string().min(100),
    contentType: z.string().optional().default("image/jpeg"),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const client = await getStorageClient();
  if (!client) return res.status(503).json({ error: "Storage unavailable" });

  try {
    const { userId, imageBase64 } = parsed.data;
    const objectKey = `meal-photos/${userId}/${randomUUID()}.jpg`;
    const buffer = Buffer.from(imageBase64, "base64");
    const result = await client.uploadFromBytes(objectKey, buffer, { contentType: "image/jpeg" } as Record<string, unknown>);
    if (!result.ok) {
      return res.status(500).json({ error: "Upload failed" });
    }
    return res.json({ objectKey, publicUrl: `/api/storage/objects/${objectKey}` });
  } catch (err) {
    console.error("[storage/upload] Failed:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

router.use("/storage/objects", async (req, res, next) => {
  if (req.method !== "GET") return next();
  const objectKey = req.path.replace(/^\/+/, "");
  if (!objectKey || objectKey.includes("..")) {
    return res.status(400).json({ error: "Invalid object key" });
  }
  const client = await getStorageClient();
  if (!client) return res.status(503).json({ error: "Storage unavailable" });
  try {
    const result = await client.downloadAsBytes(objectKey);
    if (!result.ok || !result.value[0]) {
      return res.status(404).json({ error: "Object not found" });
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(result.value[0]);
  } catch {
    return res.status(404).json({ error: "Object not found" });
  }
});

export default router;
