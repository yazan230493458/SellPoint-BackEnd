import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import { usersWithFeaturedPlacement } from "../../lib/premium.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

const favoriteSchema = z.object({ adId: z.number().int().positive() });

router.get("/favorites", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const favorites = await prisma.favorites.findMany({
    where: { userId: req.userId, ad: { isDeleted: false, isActive: true } },
    include: { ad: true },
    orderBy: { createdAt: "desc" },
  });
  const featured = await usersWithFeaturedPlacement(favorites.map((favorite) => favorite.ad.userId));
  res.status(200).json({
    favorites: favorites.map((favorite) => ({
      id: favorite.id,
      adId: favorite.adId,
      title: favorite.ad.adName,
      category: favorite.ad.category,
      price: favorite.ad.price.toString(),
      location: `${favorite.ad.selectedCity}, ${favorite.ad.selectedCountry}`,
      imageUrl: favorite.ad.images[favorite.ad.mainImageIndex] ?? favorite.ad.images[0] ?? "",
      href: `/search/ad/${favorite.ad.id}`,
      featuredActive: featured.has(favorite.ad.userId),
      createdAt: favorite.createdAt,
    })),
  });
}));

router.post("/favorites", authMiddleware, validate({ body: favoriteSchema }), asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const body = req.input?.body as z.infer<typeof favoriteSchema>;
  const ad = await prisma.ads.findFirst({
    where: { id: body.adId, isActive: true, isDeleted: false },
  });
  if (!ad) throw new HttpError(404, "Ad not found");
  const existing = await prisma.favorites.findUnique({
    where: { userId_adId: { userId: req.userId, adId: ad.id } },
  });
  if (existing) {
    res.status(200).json({ message: "Already saved", favoriteId: existing.id });
    return;
  }
  const favorite = await prisma.favorites.create({
    data: {
      userId: req.userId,
      adId: ad.id,
      title: ad.adName,
      category: ad.category,
      price: ad.price,
      location: `${ad.selectedCity}, ${ad.selectedCountry}`,
      imageUrl: ad.images[ad.mainImageIndex] ?? ad.images[0] ?? "",
      href: `/search/ad/${ad.id}`,
    },
  });
  res.status(201).json({ message: "Saved to favorites", favoriteId: favorite.id });
}));

router.delete("/favorites/:adId", authMiddleware, asyncHandler(async (req, res) => {
  if (!req.userId) throw new HttpError(401, "Unauthorized");
  const adId = Number(req.params.adId);
  if (!Number.isSafeInteger(adId) || adId <= 0) throw new HttpError(400, "Invalid ad ID");
  await prisma.favorites.deleteMany({ where: { userId: req.userId, adId } });
  res.status(200).json({ message: "Removed from favorites" });
}));

export default router;
