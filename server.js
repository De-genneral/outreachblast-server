const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

// Allow all origins — works for any Netlify/custom domain
app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.options("*", cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use("/send", limiter);

function getSmtpConfig(email, password) {
  const domain = email.split("@")[1]?.toLowerCase();
  const providers = {
    "gmail.com":      { host: "smtp.gmail.com",       port: 587 },
    "googlemail.com": { host: "smtp.gmail.com",       port: 587 },
    "outlook.com":    { host: "smtp.office365.com",   port: 587 },
    "hotmail.com":    { host: "smtp.office365.com",   port: 587 },
    "live.com":       { host: "smtp.office365.com",   port: 587 },
    "yahoo.com":      { host: "smtp.mail.yahoo.com",  port: 587 },
    "zoho.com":       { host: "smtp.zoho.com",        port: 587 },
    "icloud.com":     { host: "smtp.mail.me.com",     port: 587 },
    "me.com":         { host: "smtp.mail.me.com",     port: 587 },
    "protonmail.com": { host: "smtp.protonmail.ch",   port: 587 },
    "proton.me":      { host: "smtp.protonmail.ch",   port: 587 },
  };
  const config = providers[domain] || { host: `smtp.${domain}`, port: 587 };
  return {
    host: config.host, port: config.port, secure: false,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
  };
}

function friendlyError(err, email) {
  const msg = err.message || "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (msg.includes("535") || msg.includes("Username and Password") || msg.includes("Invalid login") || msg.includes("BadCredentials")) {
    if (domain === "gmail.com" || domain === "googlemail.com")
      return "Gmail rejected the password. Use an App Password — myaccount.google.com → Security → App Passwords (2FA must be ON).";
    return "Wrong password. Check your credentials.";
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND"))
    return "Cannot connect to mail server. Check SMTP host.";
  if (msg.includes("534") || msg.includes("less secure"))
    return "Gmail blocked it. You must use an App Password with 2FA enabled.";
  return msg;
}

app.get("/", (req, res) => {
  res.json({ status: "OutreachBlast server running ✓", version: "3.0.0" });
});

app.post("/test-connection", async (req, res) => {
  const { senderEmail, senderPassword } = req.body;
  if (!senderEmail || !senderPassword)
    return res.status(400).json({ ok: false, error: "Email and password required." });
  try {
    const t = nodemailer.createTransport(getSmtpConfig(senderEmail, senderPassword));
    await t.verify();
    res.json({ ok: true, message: "Connected successfully ✓" });
  } catch (err) {
    res.status(400).json({ ok: false, error: friendlyError(err, senderEmail) });
  }
});

app.post("/send", async (req, res) => {
  const { senderEmail, senderPassword, senderName, to, subject, body } = req.body;
  if (!senderEmail || !senderPassword || !to || !subject || !body)
    return res.status(400).json({ ok: false, error: "Missing required fields." });
  try {
    const t = nodemailer.createTransport(getSmtpConfig(senderEmail, senderPassword));
    await t.sendMail({
      from: senderName ? `"${senderName}" <${senderEmail}>` : senderEmail,
      to, subject, text: body,
      headers: {
        "X-Priority": "3",
        "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>`,
      },
    });
    res.json({ ok: true, message: `Sent to ${to}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: friendlyError(err, senderEmail) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`OutreachBlast v3 running on port ${PORT}`));
