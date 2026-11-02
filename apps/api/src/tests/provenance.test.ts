import { describe, expect, it } from "vitest";
import { provenanceIssues } from "../cms/provenance.js";

describe("content provenance", () => {
  it("requires a rights classification before publishing", () => {
    expect(provenanceIssues({ rightsType: null, rights: null, sourceUrl: null })).toHaveLength(1);
  });

  it("allows original content without third-party source metadata", () => {
    expect(provenanceIssues({ rightsType: "ORIGINAL", rights: null, sourceUrl: null })).toEqual([]);
  });

  it("requires rights and an HTTP(S) source for third-party content", () => {
    expect(provenanceIssues({
      rightsType: "THIRD_PARTY",
      rights: "CC BY 4.0",
      sourceUrl: "https://example.com/article",
    })).toEqual([]);

    expect(provenanceIssues({ rightsType: "THIRD_PARTY", rights: "   ", sourceUrl: "javascript:alert(1)" })).toEqual([
      "Add rights or license information for third-party content.",
      "Use an HTTP or HTTPS source URL.",
    ]);
  });
});
