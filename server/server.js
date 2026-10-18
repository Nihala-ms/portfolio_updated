
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

const normalizeOrigin = (url) => url.trim().replace(/\/+$/, "");

const allowedOrigins = [
  "http://localhost:5173",
  "https://updated-portfolio-81af.vercel.app",
  ...(process.env.CLIENT_URL || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean),
].filter((origin, index, origins) => origins.indexOf(origin) === index);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON request bodies
app.use(express.json({ limit: "10kb" }));

// --------------------------------------------------
// GEMINI AI CONFIGURATION
// --------------------------------------------------

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
  : null;

// --------------------------------------------------
// EMAIL CONFIGURATION
// --------------------------------------------------

const { SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL } = process.env;

const emailTransporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

// --------------------------------------------------
// ROOT ROUTE
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Nihala Portfolio API is running.",
  });
});

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    aiConfigured: Boolean(ai),
    emailConfigured: Boolean(
      emailTransporter && CONTACT_TO_EMAIL
    ),
  });
});

// --------------------------------------------------
// GEMINI AI PORTFOLIO CHAT
// --------------------------------------------------

app.post("/api/portfolio/chat", async (req, res) => {
  try {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Please enter a question.",
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "Your question must be under 1000 characters.",
      });
    }

    if (!ai) {
      console.error("GEMINI_API_KEY is not configured.");

      return res.status(500).json({
        success: false,
        error: "The AI service is not configured. Please try again later.",
      });
    }

    const systemInstruction = `
You are the AI Portfolio Assistant for Nihala,
an MCA graduate and entry-level web developer.

PORTFOLIO INFORMATION:
- MCA graduate from Vidya Academy of Science and Technology, 2025.
- MERN Stack training at Luminar in 2026.
- Six months of MERN Stack internship experience.
- Available to join immediately.

TECHNICAL SKILLS:
HTML, CSS, JavaScript, React, Node.js, Express,
MongoDB, REST APIs, Python, Django, Angular,
Tailwind CSS, and Figma.

PROJECTS:
Insurance Management System, SmartMoney, TripMate,
CineSpot, Weather App, Novena Care+, CareerPrep AI,
Task Manager, Aspire Hub, E-commerce Website,
and Recipe App.

INSTRUCTIONS:
- Answer visitors professionally, warmly, and clearly.
- Use simple English and short paragraphs.
- Answer questions about Nihala and her portfolio.
- Never invent qualifications, experience, achievements,
  project features, or contact details.
- If information is unavailable, say so honestly.
- Refer to Nihala in the third person when answering
  questions from recruiters.
- Do not claim to be Nihala herself.
`;

    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      system_instruction: systemInstruction,
      input: message,
    });

    const reply = interaction.output_text?.trim();

    if (!reply) {
      console.error("Gemini returned an empty response.");

      return res.status(502).json({
        success: false,
        error: "The AI returned an empty response. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("Gemini API error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
    });

    return res.status(500).json({
      success: false,
      error: "The AI assistant could not respond. Please try again.",
      ...(process.env.NODE_ENV !== "production" && {
        details: error?.message || "Unknown Gemini API error",
      }),
    });
  }
});

// --------------------------------------------------
// CONTACT FORM EMAIL
// --------------------------------------------------

app.post("/api/portfolio/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    // Validate required fields
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Please provide your name, email, and message.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();

    const cleanSubject =
      typeof subject === "string" ? subject.trim() : "";

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !cleanName ||
      cleanName.length > 100 ||
      !emailPattern.test(cleanEmail) ||
      cleanEmail.length > 254 ||
      !cleanMessage ||
      cleanMessage.length > 5000 ||
      cleanSubject.length > 150
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Please check your name, email address, subject, and message.",
      });
    }

    // Check email configuration
    if (!emailTransporter || !CONTACT_TO_EMAIL) {
      console.error(
        "Email configuration is incomplete. Check SMTP_USER, SMTP_PASS, and CONTACT_TO_EMAIL."
      );

      return res.status(500).json({
        success: false,
        error: "Email service is not configured. Please try again later.",
      });
    }

    // Send the contact form email
    const mailResult = await emailTransporter.sendMail({
      from: `"Nihala Portfolio" <${SMTP_USER}>`,
      to: CONTACT_TO_EMAIL,
      replyTo: cleanEmail,
      subject: `Portfolio message from ${cleanName}${
        cleanSubject ? ` - ${cleanSubject}` : ""
      }`,
      text: [
        "New message from your portfolio contact form",
        "",
        `Name: ${cleanName}`,
        `Email: ${cleanEmail}`,
        `Subject: ${cleanSubject || "Not provided"}`,
        "",
        "Message:",
        cleanMessage,
      ].join("\n"),
    });

    console.log("Portfolio contact email accepted by SMTP:", {
      messageId: mailResult.messageId,
      accepted: mailResult.accepted,
    });

    return res.status(200).json({
      success: true,
      message: "Your message has been sent successfully!",
    });
  } catch (error) {
    console.error("Contact form email error:", {
      message: error?.message,
      code: error?.code,
      responseCode: error?.responseCode,
    });

    return res.status(500).json({
      success: false,
      error: "Unable to send your message. Please try again.",
      ...(process.env.NODE_ENV !== "production" && {
        details: error?.message || "Unknown email error",
      }),
    });
  }
});

// --------------------------------------------------
// HANDLE UNKNOWN ROUTES
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use((error, _req, res, _next) => {
  console.error("Server error:", error.message);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    error: "An unexpected server error occurred.",
  });
});

// --------------------------------------------------
// LOCAL DEVELOPMENT / VERCEL EXPORT
// --------------------------------------------------

// Run a local server during development.
// In production, export the Express app for the
// Vercel function handler to serve.
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Portfolio API running on port ${PORT}`);
    console.log(`Gemini model configured: ${GEMINI_MODEL}`);
    console.log(`Gemini API key configured: ${Boolean(ai)}`);
    console.log(
      `Email configuration complete: ${Boolean(
        emailTransporter && CONTACT_TO_EMAIL
      )}`
    );
  });
}

export default app;
