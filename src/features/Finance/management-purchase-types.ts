import type { PurchaseInput } from './types.js';

export type ManagementPurchaseLine = {
  id: string;
  purchaseId: string;
  publicRef: string;
  supplierName: string;
  purchaseDate: string;
  description: string;
  amountNok: string;
  projectId: string | null;
  budgetItemId: string | null;
  revision: number;
};
export type ManagementPurchaseChoices = {
  seasonCode: string | null;
  projects: Array<{ id: string; name: string }>;
  items: Array<{ id: string; projectId: string; systemId: string; description: string; publicRef: string; plannedNok: string }>;
  purchases: ManagementPurchaseLine[];
};
export type ManagementPurchaseInput = PurchaseInput;
