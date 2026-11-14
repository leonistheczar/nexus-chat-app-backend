const defaultFrontendOrigins = ["http://localhost:3000"];

function parseOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      throw new Error("Origin must contain only an HTTP(S) scheme, host, and port");
    }
    return parsed.origin;
  } catch {
    throw new Error(`Invalid frontend origin configured: ${origin}`);
  }
}

export function getAllowedFrontendOrigins(): string[] {
  const configured = process.env.FRONTEND_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured?.length ? configured : defaultFrontendOrigins;
  return [...new Set(origins.map(parseOrigin))];
}

export function isAllowedFrontendOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return false;
  try {
    return getAllowedFrontendOrigins().includes(parseOrigin(origin));
  } catch {
    return false;
  }
}
