import { describe, expect, it } from "vitest";
import { googleDriveFolder } from "./department-home";
import { parseDepartmentHome } from "../../../api/_lib/department-home-service";
describe("department shared Drive resources", () => {
  it("normalizes folder links and retains resource keys", () => {
    expect(
      googleDriveFolder(
        "https://drive.google.com/drive/u/1/folders/folder_123?usp=sharing&resourcekey=key_1",
      ),
    ).toBe(
      "https://drive.google.com/drive/folders/folder_123?resourcekey=key_1",
    );
    expect(googleDriveFolder("")).toBeNull();
  });
  it.each([
    "javascript:alert(1)",
    "https://drive.google.com.evil.invalid/drive/folders/id",
    "https://evil.invalid/drive/folders/id",
    "http://drive.google.com/drive/folders/id",
    "https://name:secret@drive.google.com/drive/folders/id",
    "https://drive.google.com/file/d/file-id/view",
    "https://drive.google.com/drive/folders/id?resourcekey=bad%20key",
  ])("rejects unsafe or non-folder links: %s", (url) => {
    expect(() => googleDriveFolder(url)).toThrow("Google Drive folder");
  });
  it("bounds settings payloads and requires a real saved revision", () => {
    const input = {
      action: "save_department_home",
      departmentId: "10000000-0000-4000-8000-000000000001",
      expectedRevision: 0,
      description: " Team ",
      driveFolderUrl: null,
    };
    expect(parseDepartmentHome(input).description).toBe("Team");
    for (const patch of [
      { departmentId: "invalid" },
      { expectedRevision: -1 },
      { expectedRevision: 2147483647 },
      { description: "x".repeat(2001) },
      { driveFolderUrl: "https://evil.invalid" },
      { driveFolderUrl: undefined },
    ])
      expect(() => parseDepartmentHome({ ...input, ...patch })).toThrow();
  });
});
