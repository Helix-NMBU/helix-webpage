import { createHash } from "node:crypto";
import type { FinanceObjectStorage } from "../../../api/_lib/finance-storage.js";

export function createMemoryFinanceStorage(): FinanceObjectStorage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    stagingKey(memberId, uploadId) {
      return `${memberId}/staging/${uploadId}/${createHash("sha256").update(`${uploadId}-staging`).digest("hex").slice(0, 32)}`;
    },
    finalKey(memberId, uploadId) {
      return `${memberId}/final/${uploadId}/${createHash("sha256").update(`${uploadId}-final`).digest("hex").slice(0, 32)}`;
    },
    async presignPut(stagingKey) {
      return `memory://put/${stagingKey}`;
    },
    async presignGet(storageKey) {
      return `memory://get/${storageKey}`;
    },
    async headObject(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("missing");
      return { byteSize: bytes.byteLength, contentType: "application/pdf" };
    },
    async readSignature(key, length) {
      return this.readObject(key, length);
    },
    async readObject(key, byteSize) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("missing");
      return bytes.subarray(0, byteSize);
    },
    async promoteStagingToFinal(stagingKey, finalKey) {
      const bytes = objects.get(stagingKey);
      if (!bytes) throw new Error("missing");
      objects.set(finalKey, bytes);
    },
    async remove(key) {
      objects.delete(key);
    },
  };
}

export async function putMemoryPdf(storage: ReturnType<typeof createMemoryFinanceStorage>, key: string) {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  storage.objects.set(key, bytes);
  return bytes.byteLength;
}
