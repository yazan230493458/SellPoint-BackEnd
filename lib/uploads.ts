import path from "node:path";
import fs from "node:fs/promises";

export const uploadsRoot = path.resolve(process.cwd(), "uploads");

export const isSafeUploadSegment = (value: string) =>
  value.length > 0 &&
  value.length <= 40 &&
  value === value.trim() &&
  !value.includes("..") &&
  !/[\\/:\0]/.test(value);

export const resolveInsideUploads = (...segments: string[]) => {
  const resolved = path.resolve(uploadsRoot, ...segments);
  if (resolved !== uploadsRoot && !resolved.startsWith(`${uploadsRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
};

export const privateRoot = path.resolve(process.cwd(), "private-uploads");

export const resolveInsidePrivate = (...segments: string[]) => {
  const resolved = path.resolve(privateRoot, ...segments);
  if (resolved !== privateRoot && !resolved.startsWith(`${privateRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
};

const messageImageName = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export const messageAttachmentPath = (conversationId: number, filename: string) => {
  if (!messageImageName.test(filename)) return null;
  return resolveInsidePrivate("messages", String(conversationId), filename);
};

export const isOwnedAdImage = (imageUrl: string, username: string, adId: number) => {
  const prefix = `/uploads/users/${username}/${adId}/adImages/`;
  if (!imageUrl.startsWith(prefix)) {
    return false;
  }
  const filename = imageUrl.slice(prefix.length);
  if (!filename || filename !== path.basename(filename) || /[\\/]/.test(filename)) {
    return false;
  }
  return resolveInsideUploads("users", username, String(adId), "adImages", filename) !== null;
};

export const unlinkOwnedImage = async (imageUrl: string, username: string, adId: number) => {
  if (!isOwnedAdImage(imageUrl, username, adId)) {
    return false;
  }
  const prefix = `/uploads/users/${username}/${adId}/adImages/`;
  const filename = imageUrl.slice(prefix.length);
  const imagePath = resolveInsideUploads("users", username, String(adId), "adImages", filename);
  if (!imagePath) {
    return false;
  }
  try {
    await fs.unlink(imagePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== "ENOENT") {
      throw error;
    }
  }
  return true;
};

const avatarName = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export const unlinkOwnedAvatar = async (avatarUrl: string | null | undefined, username: string) => {
  if (!avatarUrl || !isSafeUploadSegment(username)) return false;
  const prefix = `/uploads/users/${username}/avatarUrl/`;
  if (!avatarUrl.startsWith(prefix)) return false;
  const filename = avatarUrl.slice(prefix.length);
  if (!avatarName.test(filename)) return false;
  const imagePath = resolveInsideUploads("users", username, "avatarUrl", filename);
  if (!imagePath) return false;
  try {
    await fs.unlink(imagePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== "ENOENT") throw error;
  }
  return true;
};

export const unlinkOwnedImages = async (images: string[], username: string | null | undefined, adId: number) => {
  if (!username || !isSafeUploadSegment(username)) return;
  for (const image of images) {
    try {
      await unlinkOwnedImage(image, username, adId);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Image cleanup failed");
    }
  }
};
