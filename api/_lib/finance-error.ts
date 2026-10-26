export type FinanceFailure = { field: string; message: string; line?: number };

export class FinanceError extends Error {
  readonly errors?: FinanceFailure[];

  constructor(public status: number, message: string, errors?: FinanceFailure[]) {
    super(message);
    this.name = "FinanceError";
    this.errors = errors;
  }
}
