/**
 * Reads a fetch response body as a JSON object without throwing on a non-JSON body (Bun's plain
 * "Something went wrong!" page, a proxy error page): the text becomes `{ error }`, so the screen
 * shows a readable message instead of `Unexpected token … is not valid JSON`.
 */
export async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { value: parsed };
  } catch {
    const snippet = text.trim().slice(0, 200);
    return { error: snippet ? `server error (${res.status}): ${snippet}` : `server error (${res.status})` };
  }
}
