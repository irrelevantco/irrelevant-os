import { describe, expect, it } from "vitest";
import {
  encodeApprovalBody,
  decodeApprovalBody,
  messageBody,
} from "../../src/lib/acquisition/contracts";

describe("exact email approval across multipart form submission", () => {
  it.each([
    ["LF paragraphs", "First line\n\nSecond line\n"],
    ["Windows paragraphs", "First line\r\n\r\nSecond line\r\n"],
    ["mixed endings", "First line\r\nSecond line\nThird line\r\n"],
    ["UTF-8 and whitespace", "  Hello café — 🟢\n\nKeep these spaces.  \n"],
  ])("preserves %s byte-for-byte", async (_, draft) => {
    const preview = messageBody(
      draft,
      "Synthetic Operator",
      "123 Test Street\r\nSuite 2",
    );
    const form = new FormData();
    form.set("expected_body", preview);
    form.set("expected_body_base64", encodeApprovalBody(preview));
    const submitted = await new Request("http://localhost/synthetic-form", {
      method: "POST",
      body: form,
    }).formData();
    // This is the original browser-format bug, reproduced without a Gmail call.
    expect(submitted.get("expected_body")).not.toBe(preview);
    expect(
      decodeApprovalBody(String(submitted.get("expected_body_base64"))),
    ).toBe(preview);
  });
  it("rejects malformed, noncanonical and invalid UTF-8 envelopes", () => {
    for (const invalid of [
      "",
      "%%%",
      "YQ",
      "YQ===",
      " /w==",
      "/w==",
      "a".repeat(75001),
    ])
      expect(() => decodeApprovalBody(invalid)).toThrow(
        "Draft approval preview is invalid",
      );
  });
  it("retains the existing message length boundary", () => {
    const maximum = "x".repeat(14000);
    expect(decodeApprovalBody(encodeApprovalBody(maximum))).toBe(maximum);
    expect(() => encodeApprovalBody(maximum + "x")).toThrow();
    expect(() =>
      decodeApprovalBody(Buffer.from(maximum + "x").toString("base64")),
    ).toThrow();
  });
});
