import "../lib/env.js";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adRoutes from "./routes/ad.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import searchRoutes from "./routes/search.routes.js";
import favoriteRoutes from "./routes/favorite.routes.js";
import messageRoutes from "./routes/message.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import reportRoutes from "./routes/report.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import accountSwitcherRoutes from "./routes/account-switcher.routes.js";
import csrfMiddleware from "./middleware/csrf.middleware.js";
import { localeMiddleware } from "./middleware/locale.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import googleRoutes from "./auth/google.routes.js";
import githubRoutes from "./auth/github.routes.js";
import { uploadsRoot } from "../lib/uploads.js";
import { parseTrustedOrigins } from "../lib/cors.js";
import { additionalSecurityHeaders, hstsEnabled } from "../lib/security-headers.js";

const app: Express = express();
const PORT: number = Number(process.env.PORT) || 1000;
const CORS_ORIGIN: string = process.env.CORS_ORIGIN!;
const RATE_LIMIT_WINDOW: number = Number(process.env.RATE_LIMIT_WINDOW!);
const RATE_LIMIT_LIMIT: number = Number(process.env.RATE_LIMIT_LIMIT!);
const RATE_LIMIT_MESSAGE: string = process.env.RATE_LIMIT_MESSAGE!;
const NODE_ENV: string = process.env.NODE_ENV!;

if (!CORS_ORIGIN || !RATE_LIMIT_WINDOW || !RATE_LIMIT_LIMIT || !RATE_LIMIT_MESSAGE || !NODE_ENV) {
  throw new Error("Missing environment variables");
}

const trustedOrigins = parseTrustedOrigins(CORS_ORIGIN);
if (trustedOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must list at least one trusted frontend origin");
}

app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1" || (NODE_ENV === "production" && process.env.TRUST_PROXY !== "0")) {
  app.set("trust proxy", 1);
}

const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW * 60 * 1000,
  limit: RATE_LIMIT_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: RATE_LIMIT_MESSAGE },
});

app.use(morgan(NODE_ENV === "development" ? "development" : "combined"));
app.use(limiter);
app.use(
  helmet({
    // API + uploaded assets; clicks/embeds blocked via frame-ancestors + X-Frame-Options.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'none'"],
        scriptSrc: ["'none'"],
        upgradeInsecureRequests: NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: hstsEnabled()
      ? {
          maxAge: 15_552_000,
          includeSubDomains: false,
          preload: false,
        }
      : false,
  }),
);
app.use(additionalSecurityHeaders);
app.use(compression());
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    (req as Request).rawBody = Buffer.from(buf);
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || trustedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-payment-signature",
    "X-Locale",
    "Accept-Language",
  ],
}));
app.use(localeMiddleware);
app.use(csrfMiddleware);
app.use("/uploads", express.static(uploadsRoot, {
  index: false,
  dotfiles: "deny",
  redirect: false,
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
}));

app.use("/api", authRoutes);
app.use("/api", accountSwitcherRoutes);
app.use("/api", userRoutes);
app.use("/api", adRoutes);
app.use("/api", adminRoutes);
app.use("/api", uploadRoutes);
app.use("/api", categoryRoutes);
app.use("/api", searchRoutes);
app.use("/api", favoriteRoutes);
app.use("/api", messageRoutes);
app.use("/api", commentRoutes);
app.use("/api", reviewRoutes);
app.use("/api", notificationRoutes);
app.use("/api", paymentRoutes);
app.use("/api", reportRoutes);
app.use("/api", contactRoutes);
app.use("/api", googleRoutes);
app.use("/api", githubRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.json({ name: "SellPoint API" });
});

app.use("/api", notFoundMiddleware);
app.use(errorMiddleware);

const timestamp = new Date();
const date = timestamp.toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const hour = String(timestamp.getHours() % 12 || 12).padStart(2, "0");
const minutes = String(timestamp.getMinutes()).padStart(2, "0");
const period = timestamp.getHours() >= 12 ? "PM" : "AM";

app.listen(PORT, () => {
  console.log("=".repeat(70));
  console.log(" * © 2026 SellPoint. All rights reserved.");
  console.log(` * The server was launched in: ( ${date} | ${hour}:${minutes} ${period} )`);
  console.log(` * The Server Has Running On http://localhost:${PORT}`);
  console.log("=".repeat(70));
});
