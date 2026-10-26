export type Application = "public" | "member" | "partner";
export type ApplicationEnvironment = "production" | "preview" | "local" | "unknown";
export type PermanentEnvironment = Extract<ApplicationEnvironment, "production">;

export interface HostOptions {
  development?: boolean;
  mode?: string;
  memberPlatformPreview?: boolean;
}

export interface ApplicationHost {
  application: Application | null;
  environment: ApplicationEnvironment;
}

const hosts: Record<PermanentEnvironment, Record<Application, string>> = {
  production: {
    public: "helixnmbu.no",
    member: "internal.helixnmbu.no",
    partner: "partner.helixnmbu.no",
  },
};

// All inputs are explicit so build flags cannot override a permanent domain.
export function resolveAppHost(hostname: string, options: HostOptions = {}): ApplicationHost {
  const normalized = hostname.toLowerCase();
  if (normalized === "www.helixnmbu.no") return { application: "public", environment: "production" };
  for (const application of ["public", "member", "partner"] as const) {
    if (normalized === hosts.production[application]) return { application, environment: "production" };
  }

  if (["localhost", "127.0.0.1", "[::1]"].includes(normalized)) {
    const member = options.development && (options.mode === "member-local" || options.memberPlatformPreview);
    return { application: member ? "member" : "public", environment: "local" };
  }

  if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+vercel\.app$/.test(normalized)) {
    return { application: options.memberPlatformPreview ? "member" : "public", environment: "preview" };
  }

  return { application: null, environment: "unknown" };
}

export function getApplicationOrigin(application: Application, environment: PermanentEnvironment): string {
  return `https://${hosts[environment][application]}`;
}

// Derive the destination from the source environment, never from a build flag.
// Local/preview deployments have no known sibling origins: only same-app links
// can safely preserve their environment and port.
export function getApplicationUrl(
  application: Application,
  sourceOrigin: string,
  path = "/",
  options: HostOptions = {},
): string {
  const source = new URL(sourceOrigin);
  const resolved = resolveAppHost(source.hostname, options);
  let origin: string;
  if (resolved.environment === "production") {
    origin = getApplicationOrigin(application, resolved.environment);
  } else if (
    (resolved.environment === "local" || resolved.environment === "preview")
    && resolved.application === application
    && ["http:", "https:"].includes(source.protocol)
  ) {
    origin = source.origin;
  } else {
    throw new Error("No application origin is configured for this host and environment.");
  }

  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) {
    throw new Error("Application URLs require an absolute path within the destination origin.");
  }
  return new URL(path, origin).href;
}
