import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sendEmail } from "@/backend/auth/sendEmail";

const MSG = { to: "player@example.com", subject: "Code", text: "123456", html: "<b>123456</b>" };
const ENV_KEYS = ["RESEND_API_KEY", "SMTP2GO_API_KEY", "EMAIL_FROM", "EMAIL_FROM_NAME"] as const;

type Call = { url: string; init: RequestInit };
let calls: Call[];
let reply: { status: number; body: unknown };
const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: {} };
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("sendEmail", () => {
  test("Resend: envia com Bearer, remetente com nome e corpo text/html", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "login@westlab.dev";
    process.env.EMAIL_FROM_NAME = "FMProject";
    reply = { status: 200, body: { id: "email_1" } };

    await sendEmail(MSG);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      from: "FMProject <login@westlab.dev>", to: ["player@example.com"],
      subject: "Code", text: "123456", html: "<b>123456</b>",
    });
  });

  test("Resend tem prioridade sobre o SMTP2GO quando as duas chaves existem", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.SMTP2GO_API_KEY = "api-test";
    process.env.EMAIL_FROM = "login@westlab.dev";
    reply = { status: 200, body: { id: "email_1" } };

    await sendEmail(MSG);

    expect(calls.map((c) => c.url)).toEqual(["https://api.resend.com/emails"]);
  });

  test("Resend: erro da API vira exceção com a mensagem", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "login@westlab.dev";
    reply = { status: 403, body: { statusCode: 403, message: "The westlab.dev domain is not verified" } };

    await expect(sendEmail(MSG)).rejects.toThrow("Resend send failed: \"The westlab.dev domain is not verified\"");
  });

  test("SMTP2GO continua funcionando sem a chave do Resend", async () => {
    process.env.SMTP2GO_API_KEY = "api-test";
    process.env.EMAIL_FROM = "login@westlab.dev";
    reply = { status: 200, body: { data: { succeeded: 1, failed: 0 } } };

    await sendEmail(MSG);

    expect(calls[0]!.url).toBe("https://api.smtp2go.com/v3/email/send");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Smtp2go-Api-Key"]).toBe("api-test");
  });

  test("chave sem EMAIL_FROM é erro de configuração", async () => {
    process.env.RESEND_API_KEY = "re_test";
    await expect(sendEmail(MSG)).rejects.toThrow("EMAIL_FROM is missing");
    expect(calls).toHaveLength(0);
  });
});
