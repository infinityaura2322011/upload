"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const types_1 = require("./types");
const base_1 = require("./base");
const capabilityDetector_1 = require("../models/capabilityDetector");
const BASE = "https://generativelanguage.googleapis.com/v1beta";
// Known deprecated/unavailable model IDs (e.g. models removed from Gemini v1beta)
const DEPRECATED = new Set([
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-pro-002",
    "gemini-pro",
    "gemini-pro-vision",
    "gemini-ultra",
]);
class GeminiProvider {
    apiKey;
    id = "gemini";
    name = "Gemini";
    kind = "builtin";
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async testConnection() {
        try {
            await this.listModels();
            return true;
        }
        catch {
            return false;
        }
    }
    async listModels() {
        if (!this.apiKey)
            throw new types_1.ProviderError("missing_api_key", "No Gemini API key", this.id, false);
        return (0, base_1.withRetry)(async () => {
            const res = await (0, base_1.withTimeout)(fetch(`${BASE}/models?key=${encodeURIComponent(this.apiKey)}`), 10_000, this.id);
            if (!res.ok)
                throw (0, base_1.classifyHttpError)(res.status, await res.text(), this.id);
            const body = (await res.json());
            return (body.models ?? [])
                // Only models that support text generation
                .filter((m) => m.supportedGenerationMethods?.includes("generateContent") ||
                m.supportedGenerationMethods?.includes("generateText"))
                .map((m) => ({ id: m.name.replace("models/", ""), raw: m }))
                .filter(({ id }) => !DEPRECATED.has(id) && !id.startsWith("tunedModels/"))
                .map(({ id, raw: m }) => {
                const caps = capabilityDetector_1.ModelCapabilityDetector.detect(this.id, id);
                return {
                    providerId: this.id,
                    modelId: id,
                    displayName: m.displayName ?? id,
                    contextLength: m.inputTokenLimit,
                    capabilities: caps,
                    enabled: true,
                };
            });
        });
    }
    async generate(request) {
        if (!this.apiKey)
            throw new types_1.ProviderError("missing_api_key", "No Gemini API key", this.id, false);
        const start = Date.now();
        return (0, base_1.withRetry)(async () => {
            const url = `${BASE}/models/${request.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
            const body = {
                contents: request.messages
                    .filter((m) => m.role !== "system")
                    .map((m) => ({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }],
                })),
                generationConfig: {
                    temperature: request.temperature ?? 0.2,
                    maxOutputTokens: request.maxTokens,
                },
            };
            const systemMsg = request.messages.find((m) => m.role === "system");
            if (systemMsg)
                body.systemInstruction = { parts: [{ text: systemMsg.content }] };
            const res = await (0, base_1.withTimeout)(fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }), 90_000, this.id);
            if (!res.ok)
                throw (0, base_1.classifyHttpError)(res.status, await res.text(), this.id, request.model);
            const resp = await res.json();
            const text = resp.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (!text && resp.candidates?.[0]?.finishReason === "SAFETY") {
                throw new types_1.ProviderError("invalid_response", "Gemini blocked response (safety filter)", this.id, false, request.model);
            }
            return {
                text,
                usage: {
                    inputTokens: resp.usageMetadata?.promptTokenCount,
                    outputTokens: resp.usageMetadata?.candidatesTokenCount,
                    durationMs: Date.now() - start,
                },
                raw: resp,
            };
        });
    }
}
exports.GeminiProvider = GeminiProvider;
