/**
 * @module lib/ollama
 * Client HTTP pour l'API Ollama (LLM local).
 *
 * Expose deux modes :
 *  - `ollamaGenerate`  : réponse complète en une fois (JSON)
 *  - `ollamaStream`    : réponse en streaming (AsyncGenerator, token par token)
 *
 * Si OLLAMA_ENABLED=false ou si Ollama est injoignable, les fonctions lèvent
 * une AppError 503 avec un message explicite.
 */
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';

// ─── Types internes ────────────────────────────────────────────────────────

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    num_ctx?: number;
  };
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertEnabled(): void {
  if (!env.OLLAMA_ENABLED) {
    throw AppError.serviceUnavailable('BTS Assistant est désactivé (OLLAMA_ENABLED=false)');
  }
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Vérifie si Ollama est disponible et si le modèle configuré est chargé.
 * Utilisé par le endpoint GET /api/ai/status.
 */
export async function ollamaHealthCheck(): Promise<{ available: boolean; model: string }> {
  try {
    const res = await fetch(`${env.OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { available: false, model: env.OLLAMA_MODEL };
    const data = await res.json() as { models: Array<{ name: string }> };
    const loaded = data.models.some((m) => m.name.startsWith(env.OLLAMA_MODEL));
    return { available: loaded, model: env.OLLAMA_MODEL };
  } catch {
    return { available: false, model: env.OLLAMA_MODEL };
  }
}

/**
 * Envoie un prompt à Ollama et retourne la réponse complète (mode non-streaming).
 * @param maxTokens Nombre max de tokens à générer (défaut : 2048).
 * @param numCtx    Taille de la fenêtre de contexte (défaut : 8192).
 *                  Ajuster selon le contenu : 2048 pour les appels d'intention,
 *                  6144 pour les réponses sans guide, 8192 avec guide.
 */
export async function ollamaGenerate(prompt: string, system?: string, maxTokens = 2048, numCtx = 8192): Promise<string> {
  assertEnabled();

  let res: Response;
  try {
    res = await fetch(`${env.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        system,
        stream: false,
        options: { temperature: 0.3, num_ctx: numCtx, num_predict: maxTokens },
      } satisfies OllamaGenerateRequest),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw AppError.serviceUnavailable(`Ollama injoignable : ${msg}`);
  }

  if (!res.ok) {
    throw AppError.serviceUnavailable(`Ollama a retourné une erreur HTTP ${res.status}`);
  }

  const data = await res.json() as OllamaGenerateResponse;
  return data.response.trim();
}

/**
 * Envoie un prompt à Ollama et retourne les tokens un par un (streaming).
 * Utiliser avec Server-Sent Events ou Response streaming.
 * @param numCtx Taille de la fenêtre de contexte (défaut : 8192).
 */
export async function* ollamaStream(
  prompt: string,
  system?: string,
  numCtx = 8192,
): AsyncGenerator<string, void, unknown> {
  assertEnabled();

  let res: Response;
  try {
    res = await fetch(`${env.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        system,
        stream: true,
        options: { temperature: 0.3, num_ctx: numCtx, num_predict: 2048 },
      } satisfies OllamaGenerateRequest),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw AppError.serviceUnavailable(`Ollama injoignable : ${msg}`);
  }

  if (!res.ok || !res.body) {
    throw AppError.serviceUnavailable(`Ollama erreur HTTP ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line) as OllamaGenerateResponse;
        if (chunk.response) yield chunk.response;
        if (chunk.done) return;
      } catch {
        // Ligne incomplète — ignorer
      }
    }
  }
}
