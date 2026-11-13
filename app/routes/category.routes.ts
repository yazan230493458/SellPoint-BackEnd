import { Router, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import authMiddleware from "../middleware/auth.middleware.js";
import adminMiddleware from "../middleware/admin.middleware.js";

const router = Router();

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  imageUrl: z.string().url().nullish(),
  parentId: z.number().int().positive().nullish(),
  sortOrder: z.number().int().min(0).default(0),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

const idSchema = z.coerce.number().int().positive();

function isPrismaError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

async function checkCycle(categoryId: number, parentId: number): Promise<boolean> {
  if (categoryId === parentId) return true;
  let currentId: number | null = parentId;
  while (currentId !== null) {
    if (currentId === categoryId) return true;
    const parentRecord: { parentId: number | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!parentRecord) break;
    currentId = parentRecord.parentId;
  }
  return false;
}

router.get("/get-categories", async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return res.json({ categories });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/get-category/:id", async (req: Request, res: Response) => {
  try {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await prisma.category.findUnique({
      where: { id: parsedId.data },
    });

    if (!category || !category.isActive) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json({ category });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/set-category",
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const parsedBody = categorySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          message: "Invalid input",
          errors: parsedBody.error.flatten(),
        });
      }

      const { name, slug, description, imageUrl, parentId, sortOrder } = parsedBody.data;

      if (parentId !== undefined && parentId !== null) {
        const parent = await prisma.category.findUnique({
          where: { id: parentId },
          select: { id: true, isActive: true },
        });
        if (!parent) {
          return res.status(400).json({ message: "Parent category not found" });
        }
        if (!parent.isActive) {
          return res.status(400).json({ message: "Parent category is inactive" });
        }
      }

      const category = await prisma.category.create({
        data: {
          name,
          slug,
          description: description ?? null,
          imageUrl: imageUrl ?? null,
          parentId: parentId ?? null,
          sortOrder,
        },
      });

      return res.status(201).json({ category });
    } catch (error: unknown) {
      if (isPrismaError(error)) {
        if (error.code === "P2002") {
          return res.status(409).json({ message: "Category name or slug already exists" });
        }
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/edit-category/:id",
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const parsedId = idSchema.safeParse(req.params.id);
      const parsedBody = categorySchema.partial().safeParse(req.body);

      if (
        !parsedId.success ||
        !parsedBody.success ||
        Object.keys(parsedBody.data).length === 0
      ) {
        return res.status(400).json({ message: "Invalid input" });
      }

      const categoryId = parsedId.data;
      const { name, slug, description, imageUrl, parentId, sortOrder } = parsedBody.data;

      if (parentId !== undefined && parentId !== null) {
        if (parentId === categoryId) {
          return res.status(400).json({ message: "Category cannot be its own parent" });
        }
        const parent = await prisma.category.findUnique({
          where: { id: parentId },
          select: { id: true, isActive: true, parentId: true },
        });
        if (!parent) {
          return res.status(400).json({ message: "Parent category not found" });
        }
        if (!parent.isActive) {
          return res.status(400).json({ message: "Parent category is inactive" });
        }
        const hasCycle = await checkCycle(categoryId, parentId);
        if (hasCycle) {
          return res.status(400).json({ message: "Invalid category hierarchy" });
        }
      }

      const updateData: {
        name?: string;
        slug?: string;
        description?: string | null;
        imageUrl?: string | null;
        parentId?: number | null;
        sortOrder?: number;
      } = {};

      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug;
      if (description !== undefined) updateData.description = description ?? null;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl ?? null;
      if (parentId !== undefined) updateData.parentId = parentId ?? null;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      const category = await prisma.category.update({
        where: { id: categoryId },
        data: updateData,
      });

      return res.json({ category });
    } catch (error: unknown) {
      if (isPrismaError(error)) {
        if (error.code === "P2025") {
          return res.status(404).json({ message: "Category not found" });
        }
        if (error.code === "P2002") {
          return res.status(409).json({ message: "Category name or slug already exists" });
        }
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/category/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const parsedId = idSchema.safeParse(req.params.id);
      const parsedBody = statusSchema.safeParse(req.body);

      if (!parsedId.success || !parsedBody.success) {
        return res.status(400).json({ message: "Invalid input" });
      }

      const category = await prisma.category.update({
        where: { id: parsedId.data },
        data: { isActive: parsedBody.data.isActive },
      });

      return res.json({ category });
    } catch (error: unknown) {
      if (isPrismaError(error)) {
        if (error.code === "P2025") {
          return res.status(404).json({ message: "Category not found" });
        }
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/categories/:id",
  authMiddleware,
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const category = await prisma.category.findUnique({
        where: { id: parsedId.data },
        include: { children: { select: { id: true, name: true, slug: true } } },
      });
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      if (category.children.length > 0) {
        return res.status(409).json({ message: "Reassign or remove child categories first" });
      }

      const names = [category.name, category.slug];
      const linkedAds = await prisma.ads.count({
        where: { isDeleted: false, category: { in: names } },
      });
      if (linkedAds > 0) {
        return res.status(409).json({ message: "Category is used by existing advertisements" });
      }

      await prisma.category.delete({ where: { id: category.id } });
      return res.json({ message: "Category deleted" });
    } catch {
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

export default router;