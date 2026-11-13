import { Router } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../lib/http.js";
import {
  listSwitcherAccounts,
  prepareAddSwitcherAccount,
  removeSwitcherAccount,
  switchSwitcherAccount,
} from "../../lib/account-switcher.js";
import { accountUserSelect } from "../../lib/sanitize.js";
import { getActiveSubscription } from "../../lib/premium.js";
import { optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";

const router = Router();

const switchSchema = z.object({
  userId: z.number().int().positive(),
});

const loadSessionUser = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: accountUserSelect,
  });
  if (!user) throw new HttpError(404, "User not found");
  const subscription = await getActiveSubscription(user.id);
  return { ...user, premium: Boolean(subscription) };
};

router.get(
  "/accounts/switcher",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const result = await listSwitcherAccounts(req, res);
    res.status(200).json(result);
  }),
);

router.post(
  "/accounts/switch",
  authRateLimit,
  optionalAuth,
  validate({ body: switchSchema }),
  asyncHandler(async (req, res) => {
    const body = req.input?.body as z.infer<typeof switchSchema>;
    const userId = await switchSwitcherAccount(req, res, body.userId);
    const user = await loadSessionUser(userId);
    res.status(200).json({ message: "Account switched", user });
  }),
);

router.post(
  "/accounts/switcher/prepare-add",
  authRateLimit,
  optionalAuth,
  asyncHandler(async (req, res) => {
    await prepareAddSwitcherAccount(req, res);
    res.status(200).json({ message: "Ready to add another account" });
  }),
);

router.delete(
  "/accounts/switcher/:userId",
  authRateLimit,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new HttpError(400, "Invalid user");
    }
    await removeSwitcherAccount(req, res, userId);
    res.status(200).json({ message: "Saved account removed" });
  }),
);

export default router;
