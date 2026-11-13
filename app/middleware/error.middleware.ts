import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { Prisma } from "../../generator/prisma/client.js";
import { HttpError } from "../../lib/http.js";
import { translateMessage } from "../../lib/i18n/messages.js";
import { normalizeLocale } from "../../lib/i18n/locales.js";

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const locale = normalizeLocale(req.locale ?? req.header("x-locale"));

  if (error instanceof HttpError) {
    res.status(error.status).json({
      message: translateMessage(error.message, locale),
      ...(error.details !== undefined ? { errors: error.details } : {}),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: translateMessage("Invalid input", locale),
      errors: error.flatten(),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`Prisma error ${error.code}`);
    if (error.code === "P2002") {
      res.status(409).json({
        message: translateMessage("Record already exists", locale),
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({
        message: translateMessage("Record not found", locale),
      });
      return;
    }
    res.status(400).json({
      message: translateMessage(
        "Database request could not be completed",
        locale,
      ),
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      message: translateMessage("Upload rejected", locale),
    });
    return;
  }

  if (
    error instanceof Error &&
    (error.message === "Image type not supported" ||
      error.message === "Invalid image content" ||
      error.message === "Invalid upload destination")
  ) {
    res.status(400).json({
      message: translateMessage(error.message, locale),
    });
    return;
  }

  console.error(error instanceof Error ? error.message : "Unknown error");
  res.status(500).json({
    message: translateMessage("Internal server error", locale),
  });
};
