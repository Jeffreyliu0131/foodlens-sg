import type { Intent } from "../shared/schemas";

// V0 recognizes only complete simple clauses. A composite condition (for
// example, "under $10 and peanut-free") must not lose its unsupported portion.
export function isBudgetConstraint(value: string): boolean {
  return /^(?:(?:hard )?(?:budget|price|cost)\s*)?(?:under|below|at most|<=)?\s*(?:S\$|SGD|\$)?\s*\d+(?:\.\d+)?\s*(?:SGD|dollars|per person)?[.!]?$/i.test(value.trim()) ||
    /^(?:预算)?(?:不超过|低于|最多)\s*\d+(?:\.\d+)?\s*(?:新币|新元|元)?[。！]?$/.test(value.trim());
}

export function hasHardBudget(intent: Intent): boolean {
  return intent.budgetSgdMax !== null && intent.hardConstraints.some(isBudgetConstraint);
}
