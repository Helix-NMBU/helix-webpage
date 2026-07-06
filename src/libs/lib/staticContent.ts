export type SponsorRecord = {
  id: number;
  name: string;
  image?: string;
  link?: string;
  category: "Main" | "Gold" | "Silver" | "Bronze" | "Service";
  logoSize?: string;
};

export type CarRecord = {
  id: number;
  name: string;
  season: string;
  image: string;
  stats: {
    focus: string;
    engine: string;
    weight: string;
  };
};

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loadSponsors(): Promise<SponsorRecord[]> {
  const data = await loadJson<SponsorRecord[]>("/sponsor.json");
  return Array.isArray(data) ? data : [];
}

export async function loadCars(): Promise<CarRecord[]> {
  const data = await loadJson<CarRecord[]>("/CarInfo.json");
  return Array.isArray(data) ? data : [];
}