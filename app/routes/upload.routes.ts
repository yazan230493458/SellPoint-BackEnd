import { Router } from "express";
import upload, { cleanupUploadedFiles, verifyUploadedImages } from "../middleware/upload.middleware.js";
import prisma from "../../lib/prisma.js";
import verifyAdOwnership from "../middleware/verifyAdOwnership.middleware.js";
import verifyAvatarUpload from "../middleware/verifyAvatarUpload.middleware.js";
import { uploadRateLimit } from "../middleware/rate-limit.middleware.js";
import authMiddleware from "../middleware/auth.middleware.js";
import fs from "node:fs/promises";
import path from "node:path";
import { unlinkOwnedAvatar } from "../../lib/uploads.js";

const router = Router();
router.use((req, res, next) => {
  const path = req.path;
  const owned = path.startsWith("/upload-ad-images") || path === "/avatar-url" || path.startsWith("/delete-ad-image");
  if (!owned) {
    next();
    return;
  }
  authMiddleware(req, res, next);
});

router.post(
  "/upload-ad-images/:adId",
  uploadRateLimit,
  verifyAdOwnership,
  upload.array("images", 8),
  verifyUploadedImages,
  async (req, res) => {
    try {
      const userID: number = Number(req.userId);

      const username: string = String(req.username);

      const adID = Number(req.params.adId);

      const files = req.files as Express.Multer.File[] | undefined;

      if (
        !Number.isSafeInteger(adID) ||
        adID <= 0 ||
        !Number.isSafeInteger(userID) ||
        userID <= 0 ||
        !username ||
        !files ||
        files.length === 0
      ) {
        await cleanupUploadedFiles(req);
        return res.status(400).json({
          message: "Invalid data provided",
        });
      }

      const ad = await prisma.ads.findFirst({
        where: {
          id: adID,
          userId: userID,
          isDeleted: false,
        },
      });

      if (!ad) {
        await cleanupUploadedFiles(req);
        return res.status(404).json({
          message: "Ad not found",
        });
      }

      if (ad.images.length + files.length > 8) {
        await cleanupUploadedFiles(req);
        return res.status(400).json({
          message: "Image limit reached",
        });
      }

      const images: string[] = files.map(
        (file) =>
          `/uploads/users/${username}/${adID}/adImages/${file.filename}`,
      );

      const updatedAd = await prisma.ads.update({
        where: { id: adID },
        data: {
          images: [...ad.images, ...images],
          mainImageIndex: ad.images.length === 0 ? 0 : ad.mainImageIndex,
        },
      });

      if (!updatedAd) {
        return res.status(400).json({
          message: "Failed to upload images",
        });
      }

      return res.status(200).json({
        message: "Images uploaded successfully",
        images: updatedAd.images,
      });
    } catch (error) {
      await cleanupUploadedFiles(req);
      console.error(error instanceof Error ? error.message : "Upload failed");
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  },
);

router.post(
  "/avatar-url",
  uploadRateLimit,
  verifyAvatarUpload,
  upload.single("avatarUrl"),
  verifyUploadedImages,
  async (req, res) => {
    try {
      const userID = Number(req.userId);

      const username = String(req.username ?? "");

      const file = req.file as Express.Multer.File | undefined;

      if (!Number.isSafeInteger(userID) || userID <= 0 || !username || !file) {
        return res.status(400).json({
          message: "Invalid data provided",
        });
      }

      const avatarUrl = `/uploads/users/${username}/avatarUrl/${file.filename}`;
      const current = await prisma.users.findUnique({
        where: { id: userID },
        select: { avatarUrl: true },
      });

      const updatedUser = await prisma.users.update({
        where: {
          id: userID,
        },
        data: {
          avatarUrl,
        },
      });

      if (current?.avatarUrl && current.avatarUrl !== avatarUrl) {
        try {
          await unlinkOwnedAvatar(current.avatarUrl, username);
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Avatar cleanup failed");
        }
      }

      return res.status(200).json({
        message: "Avatar URL updated successfully",
        avatarUrl: updatedUser.avatarUrl,
      });
    } catch (error) {
      await cleanupUploadedFiles(req);
      console.error(error instanceof Error ? error.message : "Upload failed");
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  },
);

router.delete(
  "/delete-ad-image/:adId",
  verifyAdOwnership,
  async (req, res) => {
    try {
      const userId = Number(req.userId);
      const adId = Number(req.params.adId);
      const username = String(req.username ?? "");
      const { imageUrl } = req.body as { imageUrl?: unknown };

      if (
        !Number.isSafeInteger(userId) ||
        userId <= 0 ||
        !Number.isSafeInteger(adId) ||
        adId <= 0 ||
        !username ||
        /[\\/]/.test(username) ||
        typeof imageUrl !== "string" ||
        !imageUrl
      ) {
        return res.status(400).json({
          message: "Invalid data provided",
        });
      }

      const ad = await prisma.ads.findFirst({
        where: {
          id: adId,
          userId,
        },
      });

      if (!ad) {
        return res.status(404).json({
          message: "Ad not found",
        });
      }

      const imageIndex = ad.images.indexOf(imageUrl);

      if (imageIndex === -1) {
        return res.status(404).json({
          message: "Image not found",
        });
      }

      const imagePrefix =
        `/uploads/users/${username}/${adId}/adImages/`;

      if (!imageUrl.startsWith(imagePrefix)) {
        return res.status(400).json({
          message: "Invalid image path",
        });
      }

      const filename = imageUrl.slice(imagePrefix.length);

      if (
        !filename ||
        filename === "." ||
        filename === ".." ||
        /[\\/]/.test(filename) ||
        path.basename(filename) !== filename
      ) {
        return res.status(400).json({
          message: "Invalid image path",
        });
      }

      const uploadsDirectory = path.resolve(
        process.cwd(),
        "uploads",
      );

      const imagePath = path.resolve(
        uploadsDirectory,
        "users",
        username,
        String(adId),
        "adImages",
        filename,
      );

      if (
        !imagePath.startsWith(
          `${uploadsDirectory}${path.sep}`,
        )
      ) {
        return res.status(400).json({
          message: "Invalid image path",
        });
      }

      const updatedImages = [...ad.images];
      updatedImages.splice(imageIndex, 1);

      let mainImageIndex = ad.mainImageIndex;

      if (
        updatedImages.length === 0 ||
        imageIndex === mainImageIndex
      ) {
        mainImageIndex = 0;
      } else if (imageIndex < mainImageIndex) {
        mainImageIndex -= 1;
      }

      await prisma.ads.update({
        where: {
          id: adId,
        },
        data: {
          images: updatedImages,
          mainImageIndex,
        },
      });

      let fileDeleted = true;

      try {
        await fs.unlink(imagePath);
      } catch (error) {
        const fileError = error as NodeJS.ErrnoException;

        if (fileError.code !== "ENOENT") {
          fileDeleted = false;
          console.error("Failed to delete image file:", error);
        }
      }

      return res.status(200).json({
        message: fileDeleted
          ? "Image deleted successfully"
          : "Image removed from ad, but file cleanup failed",
        images: updatedImages,
        fileDeleted,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Internal server error",
      });
    }
  },
);

export default router;
