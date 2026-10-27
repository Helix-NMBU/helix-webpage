import type { FinanceFieldError } from "./finance-types.js";

export type FinanceRecoveryHint = {
  action: "registerDirect";
  field?: string;
};

export class FinanceError extends Error {
  readonly errors?: FinanceFieldError[];
  readonly recovery?: FinanceRecoveryHint;

  constructor(public status: number, message: string, errors?: FinanceFieldError[], recovery?: FinanceRecoveryHint) {
    super(message);
    this.name = "FinanceError";
    this.errors = errors;
    this.recovery = recovery;
  }
}
