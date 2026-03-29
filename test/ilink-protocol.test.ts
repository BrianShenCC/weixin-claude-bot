import assert from "node:assert/strict";
import test from "node:test";

import { getUpdates } from "../src/ilink/api.ts";
import { loginWithQR } from "../src/ilink/auth.ts";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withMockedFetch(
  responses: Response[],
  fn: (calls: FetchCall[]) => Promise<void>,
): Promise<void> {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }
    return next;
  }) as typeof fetch;

  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("loginWithQR sends current iLink version headers on QR requests", async () => {
  const originalConsoleLog = console.log;
  console.log = () => undefined;

  try {
    await withMockedFetch(
      [
        jsonResponse({
          qrcode: "mock-qrcode",
          qrcode_img_content: "https://example.com/mock-qr.png",
        }),
        jsonResponse({
          status: "confirmed",
          bot_token: "token-123",
          ilink_bot_id: "bot@im.bot",
          baseurl: "https://example.com/",
          ilink_user_id: "user@im.wechat",
        }),
      ],
      async (calls) => {
        const result = await loginWithQR("https://ilinkai.weixin.qq.com");

        assert.equal(result.botToken, "token-123");
        assert.equal(calls.length, 2);

        const qrHeaders = new Headers(calls[0]?.init?.headers);
        const statusHeaders = new Headers(calls[1]?.init?.headers);

        assert.equal(qrHeaders.get("iLink-App-Id"), "bot");
        assert.equal(qrHeaders.get("iLink-App-ClientVersion"), "131329");
        assert.equal(statusHeaders.get("iLink-App-Id"), "bot");
        assert.equal(statusHeaders.get("iLink-App-ClientVersion"), "131329");
      },
    );
  } finally {
    console.log = originalConsoleLog;
  }
});

test("getUpdates reuses the same protocol version in headers and base_info", async () => {
  await withMockedFetch([jsonResponse({ ret: 0, msgs: [], get_updates_buf: "next" })], async (calls) => {
    const response = await getUpdates(
      {
        baseUrl: "https://ilinkai.weixin.qq.com",
        token: "bot-token",
      },
      {
        get_updates_buf: "prev",
      },
    );

    assert.equal(response.get_updates_buf, "next");
    assert.equal(calls.length, 1);

    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("iLink-App-Id"), "bot");
    assert.equal(headers.get("iLink-App-ClientVersion"), "131329");

    const body = JSON.parse(String(calls[0]?.init?.body));
    assert.deepEqual(body.base_info, { channel_version: "2.1.1" });
  });
});

test("loginWithQR surfaces the server's upgrade hint when QR status is rejected", async () => {
  const originalConsoleLog = console.log;
  console.log = () => undefined;

  try {
    await withMockedFetch(
      [
        jsonResponse({
          qrcode: "mock-qrcode",
          qrcode_img_content: "https://example.com/mock-qr.png",
        }),
        jsonResponse(
          {
            errmsg: "请在OpenClaw中升级WeChat 接口版本后再试",
          },
          400,
        ),
      ],
      async () => {
        await assert.rejects(
          () => loginWithQR("https://ilinkai.weixin.qq.com"),
          /请在OpenClaw中升级WeChat 接口版本后再试/,
        );
      },
    );
  } finally {
    console.log = originalConsoleLog;
  }
});
