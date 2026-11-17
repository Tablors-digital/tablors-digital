"use server";

import { headers } from "next/headers";
import nodemailer from "nodemailer";
import { demoRequestSchema } from "./schema";
import { checkRateLimit } from "./rate-limit";
import { recordLeadDb } from "@/server/modules/data/devices-db";

export type SubmitDemoRequestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "rate_limited"; message: string };

async function sendLeadNotifications(lead: {
  restaurantName: string;
  fullName: string;
  phone: string;
  email?: string;
  city?: string;
  tableCount: number;
  restaurantType?: string;
}) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const notifyTo = process.env.DEMO_NOTIFY_EMAIL || "tablor.digital@gmail.com";

  const summaryLines = [
    `New Tablor's Demo Request`,
    ``,
    `• Name: ${lead.fullName}`,
    `• Restaurant: ${lead.restaurantName}`,
    `• Phone / WhatsApp: ${lead.phone}`,
    `• Number of tables: ${lead.tableCount}`,
    ...(lead.restaurantType && lead.restaurantType !== "Other"
      ? [`• Venue type: ${lead.restaurantType}`]
      : []),
    ...(lead.city ? [`• City: ${lead.city}`] : []),
    ...(lead.email ? [`• Email: ${lead.email}`] : []),
  ];
  const textBody = summaryLines.join("\n");

  if (gmailUser && gmailPass) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass.replace(/\s+/g, ""),
      },
    });

    await transporter.sendMail({
      from: `"Tablor's Demo Leads" <${gmailUser}>`,
      to: notifyTo,
      subject: `Demo Request: ${lead.restaurantName} (${lead.fullName})`,
      text: textBody,
      html: `
        <div style="font-family:sans-serif;max-width:520px;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="margin:0 0 12px;color:#111827;">New Demo Request — Tablor's</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b7280;">Full Name</td><td style="padding:6px 0;font-weight:600;">${lead.fullName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Restaurant</td><td style="padding:6px 0;font-weight:600;">${lead.restaurantName}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Phone / WhatsApp</td><td style="padding:6px 0;font-weight:600;"><a href="https://wa.me/${lead.phone.replace(/\D/g, "")}">${lead.phone}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Tables</td><td style="padding:6px 0;font-weight:600;">${lead.tableCount}</td></tr>
            ${lead.restaurantType && lead.restaurantType !== "Other" ? `<tr><td style="padding:6px 0;color:#6b7280;">Venue Type</td><td style="padding:6px 0;">${lead.restaurantType}</td></tr>` : ""}
          </table>
        </div>
      `,
    });
  } else {
    console.warn("[leads] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipped email send");
  }

  const waPhone = process.env.CALLMEBOT_PHONE;
  const waKey = process.env.CALLMEBOT_API_KEY;
  if (waPhone && waKey) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(waPhone)}&text=${encodeURIComponent(textBody)}&apikey=${encodeURIComponent(waKey)}`;
    await fetch(url).catch((err) => console.error("[leads] WhatsApp webhook error:", err));
  }
}

export async function submitDemoRequest(
  _prevState: SubmitDemoRequestState,
  formData: FormData,
): Promise<SubmitDemoRequestState> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const clientKey = forwardedFor?.split(",")[0]?.trim() ?? "local-dev";

  const rateLimit = checkRateLimit(`demo-request:${clientKey}`);
  if (!rateLimit.allowed) {
    return {
      status: "rate_limited",
      message: "Too many requests from this connection. Please try again later.",
    };
  }

  const raw = {
    restaurantName: formData.get("restaurantName"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    city: formData.get("city") ?? "",
    tableCount: formData.get("tableCount"),
    restaurantType: formData.get("restaurantType") ?? "",
    message: formData.get("message") ?? "",
    consent: formData.get("consent") === "on",
    companyWebsite: formData.get("companyWebsite") ?? "",
  };

  const parsed = demoRequestSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  if (parsed.data.companyWebsite) {
    return { status: "success" };
  }

  await recordLeadDb({
    restaurantName: parsed.data.restaurantName,
    ownerName: parsed.data.fullName,
    phone: parsed.data.phone,
    email: parsed.data.email,
    city: parsed.data.city,
    tableCount: parsed.data.tableCount,
    restaurantType: parsed.data.restaurantType,
  });

  try {
    await sendLeadNotifications(parsed.data);
  } catch (err) {
    console.error("[leads] Failed to send email notification:", err);
  }

  console.info("[leads] demo request received", {
    restaurantName: parsed.data.restaurantName,
    city: parsed.data.city,
    restaurantType: parsed.data.restaurantType,
    tableCount: parsed.data.tableCount,
  });

  return { status: "success" };
}