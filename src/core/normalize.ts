const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "delivery",
  "menu",
  "reviews",
  "review",
  "singapore",
  "sg",
]);

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePostalCode(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  const match = digits.match(/(\d{6})$/);
  return match?.[1] ?? "";
}

export function postalCodeFromAddress(value: string | null | undefined): string {
  const match = (value ?? "").match(/\b(\d{6})\b/);
  return match?.[1] ?? "";
}

export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.slice(-8);
}

export function nameParts(name: string, explicitBranch?: string | null): {
  base: string;
  branch: string;
} {
  const parenthetical = [...name.matchAll(/\(([^)]+)\)/g)].at(-1)?.[1] ?? "";
  const atBranch = name.includes("@") ? name.split("@").at(-1) ?? "" : "";
  const branch = normalizeText(explicitBranch || parenthetical || atBranch);
  const withoutBranch = name.replace(/\([^)]+\)/g, " ").split("@")[0] ?? name;
  const tokens = normalizeText(withoutBranch)
    .split(" ")
    .filter((token) => token && !GENERIC_NAME_TOKENS.has(token));

  return {
    base: tokens.join(" "),
    branch,
  };
}

export function normalizeAddress(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\bsingapore\b/g, " ")
    .replace(/\b\d{6}\b/g, " ")
    .replace(/\broad\b/g, "rd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(" ").filter(Boolean));
}

export function tokenSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = tokenSet(left);
  const b = tokenSet(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const result = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

export function trigramSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = trigrams(left);
  const b = trigrams(right);
  const overlap = [...a].filter((gram) => b.has(gram)).length;
  return (2 * overlap) / (a.size + b.size);
}

export function nameSimilarity(left: string, right: string): number {
  const a = nameParts(left).base;
  const b = nameParts(right).base;
  return Math.max(tokenSimilarity(a, b), trigramSimilarity(a, b));
}
