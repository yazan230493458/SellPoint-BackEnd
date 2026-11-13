import type { NextFunction, Request, Response } from "express";
import { sendLocalized } from "../../lib/i18n/respond.js";

const ownerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.role !== "OWNER") {
    sendLocalized(req, res, 403, "Forbidden");
    return;
  }
  next();
};

export default ownerMiddleware;
