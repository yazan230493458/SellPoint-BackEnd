import nodemailer from "nodemailer";

const resetLocale = "en";

const configuredOrigin = () => {
  const raw = process.env.FRONTEND_URL?.trim() ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
};

const gmailPassword = () => (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");

export const passwordResetDeliveryConfigured = () =>
  Boolean(process.env.GMAIL_USER?.trim() && gmailPassword() && configuredOrigin());

export const sendPasswordResetEmail = async (recipient: string, token: string) => {
  const origin = configuredOrigin();
  const user = process.env.GMAIL_USER?.trim() ?? "";
  const pass = gmailPassword();
  if (!origin || !user || !pass) {
    throw new Error("Password reset email is not configured");
  }
  const link = `${origin}/${resetLocale}/reset-password?token=${encodeURIComponent(token)}`;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const text = [
    "A password reset was requested for your SellPoint account.",
    "",
    "Choose a new password with this link. It expires in 30 minutes and works only once:",
    link,
    "",
    "If you did not request this reset, ignore this email. Your password will not change.",
  ].join("\n");
  const html = [
    "<p>A password reset was requested for your SellPoint account.</p>",
    `<p><a href="${link}">Choose a new password</a>. This link expires in 30 minutes and works only once.</p>`,
    "<p>If you did not request this reset, ignore this email. Your password will not change.</p>",
  ].join("");
  await transporter.sendMail({
    from: `SellPoint <${user}>`,
    to: recipient,
    subject: "Reset your SellPoint password",
    text,
    html,
  });
};
