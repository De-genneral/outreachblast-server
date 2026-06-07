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
  // Auto-detect Brevo by SMTP key pattern â€” works with any sender email
  if (password && password.startsWith("xsmtpsib")) {
    return {
      host: "smtp-relay.brevo.com", port: 587, secure: false,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000, socketTimeout: 15000,
    };
  }
  const domain = email.split("@")[1]?.toLowerCase();
  const providers = {
    "gmail.com":      { host: "smtp.gmail.com",         port: 465, secure: true },
    "googlemail.com": { host: "smtp.gmail.com",         port: 465, secure: true },
    "outlook.com":    { host: "smtp.office365.com",     port: 587, secure: false },
    "hotmail.com":    { host: "smtp.office365.com",     port: 587, secure: false },
    "live.com":       { host: "smtp.office365.com",     port: 587, secure: false },
    "yahoo.com":      { host: "smtp.mail.yahoo.com",    port: 465, secure: true },
    "zoho.com":       { host: "smtp.zoho.com",          port: 465, secure: true },
    "icloud.com":     { host: "smtp.mail.me.com",       port: 587, secure: false },
    "me.com":         { host: "smtp.mail.me.com",       port: 587, secure: false },
    "protonmail.com": { host: "smtp.protonmail.ch",     port: 587, secure: false },
    "proton.me":      { host: "smtp.protonmail.ch",     port: 587, secure: false },
    "brevo.com":      { host: "smtp-relay.brevo.com",   port: 587, secure: false },
    "sendinblue.com": { host: "smtp-relay.brevo.com",   port: 587, secure: false },
  };
  const config = providers[domain] || { host: `smtp.${domain}`, port: 587, secure: false };
  return {
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, socketTimeout: 15000,
  };
}

function friendlyError(err, email) {
  const msg = err.message || "";
  const domain = email.split("@")[1]?.toLowerCase();
  if (msg.includes("535") || msg.includes("Username and Password") || msg.includes("Invalid login") || msg.includes("BadCredentials"))
    return domain === "gmail.com" ? "Gmail rejected the password. Use an App Password â€” myaccount.google.com â†’ Security â†’ App Passwords (2FA must be ON)." : "Wrong password.";
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND"))
    return "Connection timeout. Make sure your App Password is correct and 2FA is enabled on Gmail.";
  if (msg.includes("534") || msg.includes("less secure"))
    return "Gmail blocked it. Use an App Password with 2FA enabled.";
  return msg;
}

app.get("/", (req, res) => {
  res.json({ status: "OutreachBlast server running âœ“", version: "6.0.0" });
});

// â”€â”€ AI PROXY via Groq (free) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post("/generate", async (req, res) => {
  const { apiKey, prompt, systemPrompt } = req.body;
  if (!apiKey) return res.status(400).json({ ok: false, error: "Groq API key required." });
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ ok: false, error: data.error.message });
    const text = data.choices?.[0]?.message?.content || "";
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
    res.json({ ok: true, message: "Connected successfully âœ“" });
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
app.listen(PORT, () => console.log(`OutreachBlast v5 running on port ${PORT}`));
