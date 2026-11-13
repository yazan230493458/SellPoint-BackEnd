import type { RequestHandler } from "express";
import prisma from "../../lib/prisma.js";
import { sendLocalized } from "../../lib/i18n/respond.js";

const verifyAdOwnership: RequestHandler = async (req, res, next) => {
  try {
    const userID = Number(req.userId);
    const adID = Number(req.params.adId);

    if (
      !Number.isSafeInteger(userID) ||
      userID <= 0 ||
      !Number.isSafeInteger(adID) ||
      adID <= 0
    ) {
      sendLocalized(req, res, 400, "Invalid data provided");
      return;
    }

    const ad = await prisma.ads.findFirst({
      where: {
        id: adID,
        userId: userID,
      },
      select: {
        id: true,
      },
    });

    if (!ad) {
      sendLocalized(req, res, 404, "Ad not found");
      return;
    }

    next();
  } catch (error) {
    console.error(error);
    sendLocalized(req, res, 500, "Internal server error");
  }
};

export default verifyAdOwnership;