export class InvoiceTransferError extends Error {
  constructor(
    public readonly safeError:
      | "configuration_missing"
      | "provider_unavailable"
      | "provider_permission"
      | "provider_mismatch"
      | "source_unavailable"
      | "source_mismatch"
      | "transfer_uncertain",
  ) {
    super(safeError);
  }
}
