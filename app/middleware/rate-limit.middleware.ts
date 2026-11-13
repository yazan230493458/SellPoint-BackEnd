import rateLimit from "express-rate-limit";
import { sendLocalized } from "../../lib/i18n/respond.js";

const limited = (limit: number, windowMinutes: number) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      sendLocalized(req, res, 429, "Too many requests");
    },
  });

export const authRateLimit = limited(30, 15);
export const recoveryRateLimit = limited(5, 15);
export const reportRateLimit = limited(20, 15);
export const messageRateLimit = limited(30, 1);
export const uploadRateLimit = limited(40, 15);
export const viewRateLimit = limited(60, 1);
export const searchRateLimit = limited(120, 1);
export const contactRateLimit = limited(5, 15);




// import rateLimit from "express-rate-limit";

// const limited = (limit: number, windowMinutes: number) =>
//   rateLimit({
//     windowMs: windowMinutes * 60 * 1000,
//     limit,
//     standardHeaders: true,
//     legacyHeaders: false,
//     message: { message: "Too many requests" },
//   });

// export const authRateLimit = limited(10, 15);
// export const recoveryRateLimit = limited(5, 15);
// export const reportRateLimit = limited(20, 15);
// export const messageRateLimit = limited(30, 1);
// export const uploadRateLimit = limited(40, 15);
// export const viewRateLimit = limited(60, 1);
// export const searchRateLimit = limited(120, 1);

