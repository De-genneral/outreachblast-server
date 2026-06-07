const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.options("*", cors());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use("/send", limiter);

function getSmtpConfig(email, password) {
  const domain = email.split("@")[1]?.toLowerCase();
  const providers = {
    "gmail.com":      { host: "smtp.gmail.com",       port: 465, secure: true },
    "googlemail.com": { host: "smtp.gmail.com",       port: 465, secure: true },
    "outlook.com":    { host: "smtp.office365.com",   port: 587, secure: false },
    "hotmail.com":    { host: "smtp.office365.com",   port: 587, secure: false },
    "live.com":       { host: "smtp.office365.com",   port: 587, secure: false },
    "yahoo.com":      { host: "smtp.mail.yahoo.com",  port: 465, secure: true },
    "zoho.com":       { host: "smtp.zoho.com",        port: 465, secure: true },
    "icloud.com":     { host: "smtp.mail.me.com",     port: 587, secure: false },
    "me.com":         { host: "smtp.mail.me.com",     port: 587, secure: false },
    "protonmail.com": { host: "smtp.protonmail.ch",   port: 587, secure: false },
    "proton.me":      { host: "smtp.protonmail.ch",   port: 587, secure: false },
  };
  const config = providers[domain] || { host: `smtp.${domain}`, port: 587, secure: false };
  return {
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    socketTimeout: 10000,
  };
}

function friendlyError(err, email) {
  const msg = err.message || "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (msg.includes("535") || msg.includes("Username and Password") || msg.includes("Invalid login") || msg.includes("BadCredentials"))
    return domain === "gmail.com" ? "Gmail rejected the password. Use an App Password — myaccount.google.com → Security → App Passwords (2FA must be ON)." : "Wrong password.";
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND"))
    return "Connection timeout. Try switching to Render.com hosting or use a different email provider.";
  if (msg.includes("534") || msg.includes("less secure"))
    return "Gmail blocked it. Use an App Password with 2FA enabled.";
  return msg;
}

app.get("/", (req, res) => {
  res.json({ status: "OutreachBlast server running ✓", version: "4.0.0" });
});

// ── AI PROXY — generates email via Anthropic API ──────────────
app.post("/generate", async (req, res) => {
  const { apiKey, prompt, systemPrompt } = req.body;
  if (!apiKey) return res.status(400).json({ ok: false, error: "Anthropic API key required." });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ ok: false, error: data.error.message });
    const text = data.content?.map(i => i.text || "").join("") || "";
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/test-connection", async (req, res) => {
  const { senderEmail, senderPassword } = req.body;
  if (!senderEmail || !senderPassword) return res.status(400).json({ ok: false, error: "Email and password required." });
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
      headers: { "X-Priority": "3", "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>` },
    });
    res.json({ ok: true, message: `Sent to ${to}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: friendlyError(err, senderEmail) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`OutreachBlast v4 running on port ${PORT}`));
