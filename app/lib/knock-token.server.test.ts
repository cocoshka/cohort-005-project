import { describe, it, expect } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { signKnockUserToken } from "./knock-token.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const signingKey = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

function decodePart(part: string | undefined): Record<string, unknown> {
  return JSON.parse(Buffer.from(part ?? "", "base64url").toString("utf8"));
}

describe("signKnockUserToken", () => {
  it("signs a short-lived RS256 token for the signed-in person", async () => {
    const token = await signKnockUserToken(42, signingKey);
    const [header, payload, signature] = token.split(".");

    expect(decodePart(header)).toMatchObject({ alg: "RS256" });
    const claims = decodePart(payload);
    expect(claims.sub).toBe("42");
    expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(3600);

    const signedOk = verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature ?? "", "base64url")
    );
    expect(signedOk).toBe(true);
  });
});
