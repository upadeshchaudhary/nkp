export type ContentRightsType = "ORIGINAL" | "THIRD_PARTY";

export interface ContentProvenance {
  rightsType: ContentRightsType | null;
  rights: string | null;
  sourceUrl: string | null;
}

export function provenanceIssues(provenance: ContentProvenance): string[] {
  if (!provenance.rightsType) return ["Select whether this content is original or third-party material."];
  if (provenance.rightsType === "ORIGINAL") return [];

  const issues: string[] = [];
  if (!provenance.rights?.trim()) issues.push("Add rights or license information for third-party content.");
  if (!provenance.sourceUrl?.trim()) {
    issues.push("Add a source URL for third-party content.");
  } else {
    try {
      const source = new URL(provenance.sourceUrl);
      if (source.protocol !== "http:" && source.protocol !== "https:") {
        issues.push("Use an HTTP or HTTPS source URL.");
      }
    } catch {
      issues.push("Enter a valid HTTP or HTTPS source URL.");
    }
  }
  return issues;
}
