import type { RequestHandler } from "express";
import { sendLocalized } from "../../lib/i18n/respond.js";

const verifyAvatarUpload: RequestHandler = (req, res, next) => {
  const userId = Number(req.userId);
  const username = String(req.username ?? "");

  if (!Number.isSafeInteger(userId) || userId <= 0 || !username) {
    sendLocalized(req, res, 401, "Unauthorized");
    return;
  }

  next();
};

export default verifyAvatarUpload;
