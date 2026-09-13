export type PackageJsonObject = Record<string, unknown>;

export type ParseResult =
  | { ok: true; value: PackageJsonObject }
  | { ok: false; error: string };

export function parsePackageDocument(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "package.json root must be a JSON object" };
  }

  return { ok: true, value: parsed as PackageJsonObject };
}
