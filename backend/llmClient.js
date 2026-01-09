// backend/llmClient.js
const AI_PROVIDER = (process.env.AI_PROVIDER || "ollama").toLowerCase();

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}

async function runpodChat({ messages, temperature = 0.2, max_tokens = 700 }) {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;
  const model = process.env.AI_MODEL;

  if (!endpointId || !apiKey || !model) {
    throw new Error("RunPod config missing: RUNPOD_ENDPOINT_ID / RUNPOD_API_KEY / AI_MODEL");
  }

  const baseUrl = `https://api.runpod.ai/v2/${endpointId}/openai/v1`;
  const url = `${baseUrl}/chat/completions`; 

  // Cold starts can be > 60s (you saw ~80s). Give it headroom.
  const { signal, cancel } = withTimeout(240_000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = json?.error?.message || JSON.stringify(json) || resp.statusText;
      throw new Error(`RunPod error (${resp.status}): ${msg}`);
    }

    const text = json?.choices?.[0]?.message?.content ?? "";
    return { text, raw: json };
  } finally {
    cancel();
  }
}

async function ollamaChat({ messages, temperature = 0.2 }) {
  const baseUrl = process.env.AI_BASE_URL || "http://localhost:11434";
  const { signal, cancel } = withTimeout(60_000);

  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "llama3.1",
        messages,
        stream: false,
        options: { temperature },
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Ollama error (${resp.status}): ${JSON.stringify(json)}`);

    return { text: json?.message?.content ?? "", raw: json };
  } finally {
    cancel();
  }
}

async function chatLLM({ messages, temperature, max_tokens }) {
  if (AI_PROVIDER === "runpod") return runpodChat({ messages, temperature, max_tokens });
  return ollamaChat({ messages, temperature });
}

module.exports = { chatLLM };
