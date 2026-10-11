import "server-only";
import { Resend } from "resend";
import { appUrl, env } from "@/server/env";
import { log } from "@/server/log";
import { formatWeekKey, formatWeekRange, weekPath, type WeekKey } from "@/lib/weeks";

/**
 * Emails never contain planner content: no direction, tasks, notes, or transcript text.
 * They only say that something is ready and link to the app.
 */
export type Email = { to: string; subject: string; text: string; idempotencyKey: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

class ResendMailer implements Mailer {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly from: string) {
    this.client = new Resend(apiKey);
  }

  async send(email: Email) {
    const { error } = await this.client.emails.send(
      { from: this.from, to: email.to, subject: email.subject, text: email.text },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error) {
      log.error(`Failed to send email '${email.idempotencyKey}'`, error);
      throw new Error("Email delivery failed");
    }
  }
}

let override: Mailer | undefined;

export function setMailerForTests(mailer: Mailer | undefined) {
  override = mailer;
}

/** Email is optional: without RESEND_API_KEY every send is skipped. */
function mailer(): Mailer | null {
  if (override) return override;
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return RESEND_API_KEY ? new ResendMailer(RESEND_API_KEY, EMAIL_FROM) : null;
}

async function deliver(email: Email) {
  const active = mailer();
  if (!active) {
    log.debug(`Email is not set up; skipped '${email.idempotencyKey}'`);
    return;
  }
  await active.send(email);
}

type Recipient = { email: string; name: string };

function weekLink(week: WeekKey) {
  return `${appUrl()}${weekPath(week)}`;
}

function greeting(recipient: Recipient) {
  return `Hi ${recipient.name.split(" ")[0] || "there"},`;
}

export async function sendPlanningReminder(recipient: Recipient, week: WeekKey, idempotencyKey: string) {
  await deliver({
    to: recipient.email,
    subject: `Time to plan ${formatWeekKey(week)}`,
    text: [
      greeting(recipient),
      "",
      `It's planning time. Set your direction and tasks for ${formatWeekRange(week)}:`,
      weekLink(week),
    ].join("\n"),
    idempotencyKey,
  });
}

export async function sendPlanReady(recipient: Recipient, week: WeekKey, idempotencyKey: string) {
  await deliver({
    to: recipient.email,
    subject: `Your plan for ${formatWeekKey(week)} is ready`,
    text: [
      greeting(recipient),
      "",
      `Thanks for the call. Your plan for ${formatWeekRange(week)} is in your notebook.`,
      "Review it and change anything that's not right:",
      weekLink(week),
    ].join("\n"),
    idempotencyKey,
  });
}

export async function sendCallMissed(recipient: Recipient, week: WeekKey, idempotencyKey: string) {
  await deliver({
    to: recipient.email,
    subject: `We missed you — plan ${formatWeekKey(week)} in the app`,
    text: [
      greeting(recipient),
      "",
      "We tried calling for your weekly planning but couldn't reach you.",
      `You can plan ${formatWeekRange(week)} in the app instead:`,
      weekLink(week),
    ].join("\n"),
    idempotencyKey,
  });
}
