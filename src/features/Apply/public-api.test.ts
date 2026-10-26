import { expect, it } from "vitest";
import { publicWebsiteApiUrl } from "./public-api";

it("uses the member backend only for the HTTPS production public hosts", () => {
  for (const hostname of ["helixnmbu.no", "www.helixnmbu.no"]) {
    expect(publicWebsiteApiUrl({ protocol: "https:", hostname } as Location)).toBe("https://internal.helixnmbu.no/api/website");
  }
  for (const hostname of ["127.0.0.1", "internal.helixnmbu.no", "preview.vercel.app", "www.helixnmbu.no.attacker.test"]) {
    expect(publicWebsiteApiUrl({ protocol: "https:", hostname } as Location)).toBe("/api/website");
  }
  expect(publicWebsiteApiUrl({ protocol: "http:", hostname: "www.helixnmbu.no" } as Location)).toBe("/api/website");
});
