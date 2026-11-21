"use server";

import nodemailer from "nodemailer";

export type DemoFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

const TARGET_EMAIL = "tablor.digital@gmail.com";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function submitDemoRequestAction(
  _prev: DemoFormState,
  formData: FormData
): Promise<DemoFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const restaurantName = String(formData.get("restaurantName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const tablesRaw = String(formData.get("tables") ?? "").trim();
  const agreed = formData.get("agreed") === "on";

  if (!fullName || fullName.length > 100) {
    return { status: "error", message: "Please enter your full name." };
  }
  if (!restaurantName || restaurantName.length > 120) {
    return { status: "error", message: "Please enter your restaurant name." };
  }
  if (!phone || phone.length < 7 || phone.length > 25) {
    return { status: "error", message: "Please enter a valid phone or WhatsApp number." };
  }
  const tables = Number(tablesRaw);
  if (!Number.isInteger(tables) || tables < 1 || tables > 1000) {
    return { status: "error", message: "Please enter a valid number of tables." };
  }
  if (!agreed) {
    return {
      status: "error",
      message: "Please agree to be contacted about this demo request.",
    };
  }

  const gmailUser = process.env.GMAIL_USER || TARGET_EMAIL;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toEmail = process.env.DEMO_TO_EMAIL || TARGET_EMAIL;

  if (!gmailPass) {
    return {
      status: "error",
      message: "Email service is not configured yet. Please try again later.",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const text = [
      "New Tablor's Demo Request",
      "-------------------------",
      `Full Name: ${fullName}`,
      `Restaurant Name: ${restaurantName}`,
      `Phone / WhatsApp: ${phone}`,
      `Number of Tables: ${tables}`,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin: 0 0 12px;">New Tablor's Demo Request</h2>
        <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
          <tr><td><strong>Full Name:</strong></td><td>${escapeHtml(fullName)}</td></tr>
          <tr><td><strong>Restaurant Name:</strong></td><td>${escapeHtml(restaurantName)}</td></tr>
          <tr><td><strong>Phone / WhatsApp:</strong></td><td>${escapeHtml(phone)}</td></tr>
          <tr><td><strong>Number of Tables:</strong></td><td>${tables}</td></tr>
        </table>
      </div>
    `;

    await transporter.sendMail({
      from: `"Tablor's Demo" <${gmailUser}>`,
      to: toEmail,
      subject: `Demo Request — ${restaurantName} (${fullName})`,
      text,
      html,
    });

    return {
      status: "success",
      message: "Demo request sent! We'll contact you shortly.",
    };
  } catch {
    return {
      status: "error",
      message: "Couldn't send your request right now. Please try again.",
    };
  }
}