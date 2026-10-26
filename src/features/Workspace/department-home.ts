export interface DepartmentHome {
  departmentId: string;
  revision: number;
  description: string;
  driveFolderUrl: string | null;
  canEdit: boolean;
}
export interface DepartmentHomeChange {
  action: "save_department_home";
  departmentId: string;
  expectedRevision: number;
  description: string;
  driveFolderUrl: string | null;
}
export function googleDriveFolder(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "drive.google.com" ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error();
    const folder = url.pathname.match(
      /^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/,
    )?.[1];
    if (!folder) throw new Error();
    const result = new URL(`https://drive.google.com/drive/folders/${folder}`);
    const resourceKey = url.searchParams.get("resourcekey");
    if (resourceKey) {
      if (!/^[a-zA-Z0-9_-]+$/.test(resourceKey)) throw new Error();
      result.searchParams.set("resourcekey", resourceKey);
    }
    return result.href;
  } catch {
    throw new Error("Enter a shared Google Drive folder link.");
  }
}
