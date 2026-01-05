function base64UrlToJson(b64url) {
  const padded =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64url.length + 3) % 4);

  const json = atob(padded);
  return JSON.parse(json);
}

export function getJwtExpMs(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = base64UrlToJson(parts[1]);
    if (!payload?.exp) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}
