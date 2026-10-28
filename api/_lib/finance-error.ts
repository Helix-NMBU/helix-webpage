import type { FinanceFieldError } from "./finance-types.js";

export type FinanceRecoveryHint = {
  action: "registerDirect";
  field?: string;
};

export type ReviewDecision = {
  reviewer: string;
  time: string;
  reason: string;
};

export class FinanceError extends Error {
  readonly errors?: FinanceFieldError[];
  readonly recovery?: FinanceRecoveryHint;
  readonly decision?: ReviewDecision;

  constructor(
    public status: number,
    message: string,
    errors?: FinanceFieldError[],
    recovery?: FinanceRecoveryHint,
    decision?: ReviewDecision,
  ) {
    super(message);
    this.name = "FinanceError";
    this.errors = errors;
    this.recovery = recovery;
    this.decision = decision;
  }
}
