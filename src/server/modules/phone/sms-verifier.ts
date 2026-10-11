import "server-only";
import { env } from "@/server/env";
import { features } from "@/server/features";
import { HttpError } from "@/server/http";
import { log } from "@/server/log";

export interface SmsVerifier {
  sendCode(phoneE164: string): Promise<void>;
  checkCode(phoneE164: string, code: string): Promise<boolean>;
}

/** Twilio Verify REST API; Twilio generates, sends, and checks the code. */
class TwilioVerify implements SmsVerifier {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly serviceSid: string,
  ) {}

  private async post(path: string, form: Record<string, string>) {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${this.serviceSid}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    });
    return response;
  }

  async sendCode(phoneE164: string) {
    const response = await this.post("Verifications", { To: phoneE164, Channel: "sms" });
    if (!response.ok) {
      log.error(`Twilio Verify send failed with status ${response.status}`, await response.text());
      throw new Error("Could not send verification code");
    }
  }

  async checkCode(phoneE164: string, code: string) {
    const response = await this.post("VerificationCheck", { To: phoneE164, Code: code });
    // 404 means the verification expired or was already used.
    if (response.status === 404) return false;
    if (!response.ok) {
      log.error(`Twilio Verify check failed with status ${response.status}`, await response.text());
      throw new Error("Could not check verification code");
    }
    const body = (await response.json()) as { status?: string };
    return body.status === "approved";
  }
}

export const SIMULATED_VERIFICATION_CODE = "000000";

/** Demo mode (`VOICE_PROVIDER=simulated`) without Twilio: no SMS is sent and the code is always 000000. */
class SimulatedVerifier implements SmsVerifier {
  async sendCode() {
    log.warn(`Simulated SMS: use code ${SIMULATED_VERIFICATION_CODE} to verify`);
  }

  async checkCode(_phoneE164: string, code: string) {
    return code === SIMULATED_VERIFICATION_CODE;
  }
}

let override: SmsVerifier | undefined;

export function setSmsVerifierForTests(verifier: SmsVerifier | undefined) {
  override = verifier;
}

export function smsVerifier(): SmsVerifier {
  if (override) return override;
  const mode = features().sms;
  if (mode === "twilio") {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = env();
    return new TwilioVerify(TWILIO_ACCOUNT_SID!, TWILIO_AUTH_TOKEN!, TWILIO_VERIFY_SERVICE_SID!);
  }
  if (mode === "simulated") return new SimulatedVerifier();
  throw new HttpError(501, "Phone verification is not set up on this server");
}
