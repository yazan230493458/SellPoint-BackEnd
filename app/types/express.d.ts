declare global {
  namespace Express {
    interface Request {
      userId?: number;
      username?: string;
      role?: string;
      rawBody?: Buffer;
      input?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
