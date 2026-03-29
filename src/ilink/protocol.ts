/**
 * Shared iLink protocol compatibility settings.
 *
 * Tencent now validates the WeChat channel interface version separately from
 * this project's own version, so we track the upstream-compatible protocol
 * version explicitly instead of reusing package.json's app version.
 */
import type { BaseInfo } from "./types.js";

const DEFAULT_ILINK_APP_ID = "bot";
const DEFAULT_ILINK_CHANNEL_VERSION = "2.1.1";

function sanitizeVersionPart(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed & 0xff;
}

export function getIlinkAppId(): string {
  const fromEnv = process.env.ILINK_APP_ID?.trim();
  return fromEnv || DEFAULT_ILINK_APP_ID;
}

export function getIlinkChannelVersion(): string {
  const fromEnv = process.env.ILINK_CHANNEL_VERSION?.trim();
  return fromEnv || DEFAULT_ILINK_CHANNEL_VERSION;
}

/**
 * Encode semver as uint32 0x00MMNNPP, matching openclaw-weixin 2.x.
 */
export function buildIlinkClientVersion(version = getIlinkChannelVersion()): number {
  const [major, minor, patch] = version.split(".");
  return (
    (sanitizeVersionPart(major) << 16) |
    (sanitizeVersionPart(minor) << 8) |
    sanitizeVersionPart(patch)
  );
}

export function buildIlinkCommonHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": getIlinkAppId(),
    "iLink-App-ClientVersion": String(buildIlinkClientVersion()),
  };
}

export function buildBaseInfo(): BaseInfo {
  return {
    channel_version: getIlinkChannelVersion(),
  };
}
