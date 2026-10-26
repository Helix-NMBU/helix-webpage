import type { FinanceFieldError } from "./finance-types.js";

export class FinanceError extends Error {
  readonly errors?: FinanceFieldError[];

  constructor(public status: number, message: string, errors?: FinanceFieldError[]) {
    super(message);
    this.name = "FinanceError";
    this.errors = errors;
  }
}
