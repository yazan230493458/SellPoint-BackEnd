import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { isSafeUploadSegment, resolveInsidePrivate, resolveInsideUploads, uploadsRoot } from "../../lib/uploads.js";

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const mimeExtension = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const username = String(req.username ?? "");
    const adId = Number(req.params.adId);
    const isAvatar = file.fieldname === "avatarUrl";
    const isMessage = file.fieldname === "messageImage";
    const conversationId = Number(req.params.id);

    if (isMessage) {
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        cb(new Error("Invalid upload destination"), "");
        return;
      }
      const uploadDirectory = resolveInsidePrivate("messages", String(conversationId));
      if (!uploadDirectory) {
        cb(new Error("Invalid upload destination"), "");
        return;
      }
      fs.mkdirSync(uploadDirectory, { recursive: true });
      cb(null, uploadDirectory);
      return;
    }

    if (!isSafeUploadSegment(username)) {
      cb(new Error("Invalid upload destination"), "");
      return;
    }

    if (!isAvatar && (!Number.isSafeInteger(adId) || adId <= 0)) {
      cb(new Error("Invalid upload destination"), "");
      return;
    }

    const relative = isAvatar
      ? ["users", username, "avatarUrl"]
      : ["users", username, String(adId), "adImages"];
    const uploadDirectory = resolveInsideUploads(...relative);
    if (!uploadDirectory) {
      cb(new Error("Invalid upload destination"), "");
      return;
    }

    fs.mkdirSync(uploadDirectory, { recursive: true });
    cb(null, uploadDirectory);
  },
  filename: (_req, file, cb) => {
    const extension = mimeExtension[file.mimetype as keyof typeof mimeExtension];
    if (!extension) {
      cb(new Error("Image type not supported"), "");
      return;
    }
    cb(null, `${randomUUID()}${extension}`);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!Object.hasOwn(mimeExtension, file.mimetype)) {
    cb(new Error("Image type not supported"));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8,
  },
});

const isAllowedImage = (buffer: Buffer, mime: string) => {
  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];
  const jpeg = b0 === 0xff && b1 === 0xd8 && b2 === 0xff;
  const png = b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47;
  const webp = buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (mime === "image/jpeg") return jpeg;
  if (mime === "image/png") return png;
  if (mime === "image/webp") return webp;
  return false;
};

const collectedFiles = (req: Express.Request) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.file) return [req.file];
  if (req.files && typeof req.files === "object") {
    return Object.values(req.files).flat();
  }
  return [];
};

export const verifyUploadedImages: RequestHandler = async (req, _res, next) => {
  const files = collectedFiles(req);
  try {
    for (const file of files) {
      const handle = await fs.promises.open(file.path, "r");
      const buffer = Buffer.alloc(16);
      try {
        await handle.read(buffer, 0, 16, 0);
      } finally {
        await handle.close();
      }
      if (!isAllowedImage(buffer, file.mimetype)) {
        await Promise.all(files.map((item) => fs.promises.unlink(item.path).catch(() => undefined)));
        next(new Error("Invalid image content"));
        return;
      }
    }
    next();
  } catch (error) {
    await Promise.all(files.map((item) => fs.promises.unlink(item.path).catch(() => undefined)));
    next(error);
  }
};

export const cleanupUploadedFiles = async (req: Express.Request) => {
  await Promise.all(collectedFiles(req).map((file) => fs.promises.unlink(file.path).catch(() => undefined)));
};

export default upload;
