import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../../lib/http.js";

type RequestSchemas<TBody, TQuery, TParams> = {
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  params?: ZodType<TParams>;
};

export const validate =
  <TBody = unknown, TQuery = unknown, TParams = unknown>(
    schemas: RequestSchemas<TBody, TQuery, TParams>,
  ): RequestHandler =>
  (req, _res, next) => {
    const body = schemas.body ? schemas.body.safeParse(req.body) : null;
    const query = schemas.query ? schemas.query.safeParse(req.query) : null;
    const params = schemas.params ? schemas.params.safeParse(req.params) : null;

    if ((body && !body.success) || (query && !query.success) || (params && !params.success)) {
      next(
        new HttpError(400, "Invalid input", {
          ...(body && !body.success ? { body: body.error.flatten() } : {}),
          ...(query && !query.success ? { query: query.error.flatten() } : {}),
          ...(params && !params.success ? { params: params.error.flatten() } : {}),
        }),
      );
      return;
    }

    req.input = {
      ...(body ? { body: body.data } : {}),
      ...(query ? { query: query.data } : {}),
      ...(params ? { params: params.data } : {}),
    };
    next();
  };
