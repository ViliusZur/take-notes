import { describe, expect, it } from "vitest";
import { errorResponse, HttpError, json } from "@/server/http";

describe("API responses", () => {
  it("are never stored by browsers or the CDN, and carry no ETag", () => {
    for (const response of [json({ ok: true }), json({ ok: true }, { status: 201 }), errorResponse(new HttpError(404, "x"))]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("etag")).toBeNull();
    }
  });
});
