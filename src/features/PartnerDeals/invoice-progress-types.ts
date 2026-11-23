export type InvoiceProgress = {
  sentDate: string | null;
  receivedDate: string | null;
  revision: number;
  fundingRevision: number | null;
  canRecordSent: boolean;
  canRecordPayment: boolean;
  hasFunding: boolean;
};

export type InvoiceProgressInput = Pick<InvoiceProgress, "sentDate" | "receivedDate" | "fundingRevision"> & {
  taskId: string;
  expectedRevision: number;
};
