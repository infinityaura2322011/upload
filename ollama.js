"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const types_1 = require("./types");
const capabilities_1 = require("../models/capabilities");
const base_1 = require("./base");
class OllamaProvider {
    baseUrl;
    kind = "manual";
    id = "ollama";
    name = "Ollama (local)";
    activeBaseUrl;
    constructor(baseUrl = "http://127.0.0.1:11434") {
        this.baseUrl = baseUrl;
        // Normalise: strip trailing /v1 or slash so we always work from the root
        this.baseUrl = baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
        this.activeBaseUrl = this.baseUrl;
    }
    getCandidateUrls() {
        const urls = [this.activeBaseUrl, this.baseUrl];
        if (this.baseUrl.includes("localhost")) {
            urls.push(this.baseUrl.replace("localhost", "127.0.0.1"));
        }
        else if (this.baseUrl.includes("127.0.0.1")) {
            urls.push(this.baseUrl.replace("127.0.0.1", "localhost"));
        }
        urls.push("http://127.0.0.1:11434", "http://localhost:11434", "http://127.0.0.1:11435");
        return [...new Set(urls)];
    }
    async testConnection() {
        for (const url of this.getCandidateUrls()) {
            try {
                const res = await (0, base_1.withTimeout)(fetch(`${url}/api/tags`), 3_000, this.id);
                if (res.ok) {
                    this.activeBaseUrl = url;
                    return true;
                }
            }
            catch { }
        }
        return false;
    }
    async listModels() {
        let lastError = null;
        for (const url of this.getCandidateUrls()) {
            try {
                const res = await (0, base_1.withTimeout)(fetch(`${url}/api/tags`), 6_000, this.id);
                if (!res.ok)
                    continue;
                const body = (await res.json());
                const rawModels = body.models ?? [];
                if (rawModels.length === 0)
                    continue;
                this.activeBaseUrl = url;
                return rawModels.map((m) => {
                    const id = (m.name || m.model || "").trim();
                    const ctx = m.details?.context_length ?? 32768;
                    const hasTools = m.capabilities?.includes("tools") ?? false;
                    const isVision = m.capabilities?.includes("vision") ?? id.includes("vision") ?? id.includes("llava");
                    const isCoder = id.includes("code") || id.includes("coder") || id.includes("starcoder") || id.includes("deepseek") || id.includes("qwen");
                    const isReason = id.includes("r1") || id.includes("qwq") || id.includes("reason") || id.includes("70b");
                    return {
                        providerId: this.id,
                        modelId: id,
                        displayName: id,
                        contextLength: ctx,
                        enabled: true,
                        capabilities: (0, capabilities_1.defaultCapabilities)({
                            chat: true,
                            textGeneration: true,
                            coding: isCoder || true,
                            reasoning: isReason,
                            toolUse: hasTools,
                            structuredOutput: true,
                            vision: isVision,
                            streaming: true,
                        }),
                    };
                });
            }
            catch (err) {
                lastError = err;
            }
        }
        throw new types_1.ProviderError("invalid_response", `Ollama not reachable or no models returned: ${lastError}`, this.id, false);
    }
    async generate(request) {
        const start = Date.now();
        const base = this.activeBaseUrl || this.baseUrl;
        const ollamaError = (status, body) => {
            const unavailable = /out[- ]of[- ]memory|failed to load|cannot allocate|memory allocation/i.test(body);
            return new types_1.ProviderError(unavailable ? "model_unavailable" : "unknown", `Ollama ${status}: ${body.slice(0, 300)}`, this.id, !unavailable, request.model);
        };
        // First attempt: OpenAI-compatible /v1/chat/completions
        try {
            const url = `${base}/v1/chat/completions`;
            const res = await (0, base_1.withTimeout)(fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
                    temperature: request.temperature ?? 0.2,
                    max_tokens: request.maxTokens,
                    ...(request.jsonSchema ? { response_format: { type: "json_object" } } : {}),
                    stream: false,
                }),
            }), 120_000, this.id);
            if (res.ok) {
                const body = (await res.json());
                const text = body.choices?.[0]?.message?.content ?? "";
                if (text) {
                    return {
                        text,
                        usage: {
                            inputTokens: body.usage?.prompt_tokens,
                            outputTokens: body.usage?.completion_tokens,
                            durationMs: Date.now() - start,
                        },
                        raw: body,
                    };
                }
            }
            else {
                const body = await res.text().catch(() => "");
                if (/out[- ]of[- ]memory|failed to load|cannot allocate|memory allocation/i.test(body)) {
                    throw ollamaError(res.status, body);
                }
            }
        }
        catch {
            // Fall through to native /api/chat
        }
        // Native Ollama fallback: /api/chat
        const nativeUrl = `${base}/api/chat`;
        const nativeRes = await (0, base_1.withTimeout)(fetch(nativeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
                stream: false,
                options: {
                    temperature: request.temperature ?? 0.2,
                    num_predict: request.maxTokens,
                },
                ...(request.jsonSchema ? { format: "json" } : {}),
            }),
        }), 120_000, this.id);
        if (!nativeRes.ok) {
            const text = await nativeRes.text().catch(() => "");
            throw ollamaError(nativeRes.status, text);
        }
        const nativeBody = (await nativeRes.json());
        const nativeText = nativeBody.message?.content ?? "";
        if (!nativeText)
            throw new types_1.ProviderError("invalid_response", "Empty response from Ollama", this.id, false);
        return {
            text: nativeText,
            usage: {
                inputTokens: nativeBody.prompt_eval_count,
                outputTokens: nativeBody.eval_count,
                durationMs: Date.now() - start,
            },
            raw: nativeBody,
        };
    }
}
exports.OllamaProvider = OllamaProvider;
