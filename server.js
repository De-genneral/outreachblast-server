// ─────────────────────────────────────────────────────────────
//  OutreachBlast Backend Server
//  Deploy free on Railway.app or Render.com
//  No limits. Your emails. Your control.
// ─────────────────────────────────────────────────────────────

const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());
app.use(cors()); // In production, set: cors({ origin: "https://yourdomain.com" })

// Basic rate limiter — prevents abuse
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use("/send", limiter);

// ── SMTP CONFIG PER PROVIDER ──────────────────────────────────
function getSmtpConfig(email, password) {
  const domain = email.split("@")[1]?.toLowerCase();

  const providers = {
    "gmail.com":       { host: "smtp.gmail.com",        port: 587, secure: false },
    "googlemail.com":  { host: "smtp.gmail.com",        port: 587, secure: false },
    "outlook.com":     { host: "smtp.office365.com",    port: 587, secure: false },
    "hotmail.com":     { host: "smtp.office365.com",    port: 587, secure: false },
    "live.com":        { host: "smtp.office365.com",    port: 587, secure: false },
    "yahoo.com":       { host: "smtp.mail.yahoo.com",   port: 587, secure: false },
    "yahoo.co.uk":     { host: "smtp.mail.yahoo.com",   port: 587, secure: false },
    "zoho.com":        { host: "smtp.zoho.com",         port: 587, secure: false },
    "icloud.com":      { host: "smtp.mail.me.com",      port: 587, secure: false },
    "me.com":          { host: "smtp.mail.me.com",      port: 587, secure: false },
    "protonmail.com":  { host: "smtp.protonmail.ch",    port: 587, secure: false },
    "proton.me":       { host: "smtp.protonmail.ch",    port: 587, secure: false },
  };

  const config = providers[domain] || { host: `smtp.${domain}`, port: 587, secure: false };

  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
  };
}

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "OutreachBlast server running ✓", version: "1.0.0" });
});

// ── TEST CONNECTION ENDPOINT ──────────────────────────────────
app.post("/test-connection", async (req, res) => {
  const { senderEmail, senderPassword } = req.body;
  if (!senderEmail || !senderPassword)
    return res.status(400).json({ ok: false, error: "Email and password required." });

  try {
    const transporter = nodemailer.createTransport(getSmtpConfig(senderEmail, senderPassword));
    await transporter.verify();
    res.json({ ok: true, message: "Connection successful ✓" });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── SEND SINGLE EMAIL ─────────────────────────────────────────
app.post("/send", async (req, res) => {
  const { senderEmail, senderPassword, senderName, to, subject, body } = req.body;

  if (!senderEmail || !senderPassword || !to || !subject || !body)
    return res.status(400).json({ ok: false, error: "Missing required fields." });

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to))
    return res.status(400).json({ ok: false, error: "Invalid recipient email." });

  try {
    const transporter = nodemailer.createTransport(getSmtpConfig(senderEmail, senderPassword));

    await transporter.sendMail({
      from: senderName ? `"${senderName}" <${senderEmail}>` : senderEmail,
      to,
      subject,
      text: body,
      // Plain text only — better deliverability than HTML for cold outreach
      headers: {
        // Anti-spam headers
        "X-Mailer": "OutreachBlast",
        "X-Priority": "3",
        "Precedence": "bulk",
        "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>`,
      },
    });

    res.json({ ok: true, message: `Sent to ${to}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── SEND BLAST (batch) ────────────────────────────────────────
app.post("/send-blast", async (req, res) => {
  const { senderEmail, senderPassword, senderName, recipients, subject, body, delayMs = 3000 } = req.body;

  if (!senderEmail || !senderPassword || !recipients?.length || !subject || !body)
    return res.status(400).json({ ok: false, error: "Missing required fields." });

  const transporter = nodemailer.createTransport(getSmtpConfig(senderEmail, senderPassword));
  const results = [];

  for (const to of recipients) {
    // Personalize per recipient
    const firstName = to.split("@")[0].split(".")[0].replace(/[^a-zA-Z]/g, "");
    const company = to.split("@")[1].split(".")[0];
    const personalSubject = subject.replace(/{{FirstName}}/gi, firstName).replace(/{{CompanyName}}/gi, company);
    const personalBody = body.replace(/{{FirstName}}/gi, firstName).replace(/{{CompanyName}}/gi, company);

    try {
      await transporter.sendMail({
        from: senderName ? `"${senderName}" <${senderEmail}>` : senderEmail,
        to,
        subject: personalSubject,
        text: personalBody,
        headers: {
          "X-Priority": "3",
          "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>`,
        },
      });
      results.push({ to, status: "sent" });
    } catch (err) {
      results.push({ to, status: "failed", error: err.message });
    }

    // Delay between sends — critical for avoiding spam flags
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  const sent = results.filter(r => r.status === "sent").length;
  res.json({ ok: true, sent, failed: results.length - sent, results });
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`OutreachBlast server running on port ${PORT}`));
