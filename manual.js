"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualProvider = void 0;
const types_1 = require("./types");
const base_1 = require("./base");
const capabilityDetector_1 = require("../models/capabilityDetector");
class ManualProvider {
    cfg;
    kind = "manual";
    constructor(cfg) {
        this.cfg = cfg;
    }
    get id() { return this.cfg.id; }
    get name() { return this.cfg.name; }
    async testConnection() {
        try {
            const models = await this.listModels();
            return models.length > 0;
        }
        catch {
            return false;
        }
    }
    async listModels() {
        const rawBase = this.cfg.baseUrl.replace(/\/+$/, "");
        const headers = { "Content-Type": "application/json" };
        if (this.cfg.apiKey?.trim()) {
            headers["Authorization"] = `Bearer ${this.cfg.apiKey.trim()}`;
        }
        // Candidate model discovery endpoints
        const candidateUrls = [
            `${rawBase}/models`,
            rawBase.endsWith("/v1") ? `${rawBase}/models` : `${rawBase}/v1/models`,
            `${rawBase}/api/tags`, // Ollama format
        ];
        for (const url of candidateUrls) {
            try {
                const res = await (0, base_1.withTimeout)(fetch(url, { headers }), 8_000, this.id);
                if (res.ok) {
                    const body = (await res.json());
                    const rawList = Array.isArray(body)
                        ? body
                        : Array.isArray(body?.data)
                            ? body.data
                            : Array.isArray(body?.models)
                                ? body.models
                                : [];
                    if (rawList.length > 0) {
                        return rawList
                            .map((item) => {
                            const modelId = typeof item === "string"
                                ? item
                                : (item.id || item.name || item.model || "");
                            if (!modelId)
                                return null;
                            const cleanId = modelId.replace(/^models\//, "");
                            const ctx = item.context_length || item.context_window || item.input_token_limit;
                            return this.understandModel(cleanId, ctx);
                        })
                            .filter((m) => m !== null);
                    }
                }
            }
            catch {
                // Try next candidate URL
            }
        }
        if (this.cfg.manualModelIds?.length) {
            return this.cfg.manualModelIds.map((id) => this.understandModel(id));
        }
        throw new types_1.ProviderError("invalid_response", `No models could be auto-discovered from ${this.cfg.baseUrl}. Ensure the endpoint is reachable and supports /models or /v1/models.`, this.id, false);
    }
    async generate(request) {
        const start = Date.now();
        const rawBase = this.cfg.baseUrl.replace(/\/+$/, "");
        const chatUrl = rawBase.endsWith("/chat/completions")
            ? rawBase
            : rawBase.endsWith("/v1")
                ? `${rawBase}/chat/completions`
                : `${rawBase}/v1/chat/completions`;
        const headers = { "Content-Type": "application/json" };
        if (this.cfg.apiKey?.trim()) {
            headers["Authorization"] = `Bearer ${this.cfg.apiKey.trim()}`;
        }
        return (0, base_1.withRetry)(async () => {
            const res = await (0, base_1.withTimeout)(fetch(chatUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
                    temperature: request.temperature ?? 0.2,
                    max_tokens: request.maxTokens,
                }),
            }), 90_000, this.id);
            if (!res.ok)
                throw (0, base_1.classifyHttpError)(res.status, await res.text(), this.id);
            const body = (await res.json());
            const choice = body.choices?.[0];
            if (!choice)
                throw new types_1.ProviderError("invalid_response", "No choices in response", this.id, false);
            return {
                text: choice.message?.content ?? "",
                usage: {
                    inputTokens: body.usage?.prompt_tokens,
                    outputTokens: body.usage?.completion_tokens,
                    durationMs: Date.now() - start,
                },
                raw: body,
            };
        });
    }
    /**
     * Inner System Understanding Engine:
     * Uses ModelCapabilityDetector for the generic provider, with user-supplied
     * defaultCapabilities as an optional override layer.
     */
    understandModel(modelId, contextLength) {
        const detectedCaps = capabilityDetector_1.ModelCapabilityDetector.detect("generic", modelId);
        const d = this.cfg.defaultCapabilities ?? {};
        // Merge: user overrides win over auto-detection
        const caps = {
            ...detectedCaps,
            ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
        };
        // Auto-detect context window if omitted
        const lower = modelId.toLowerCase();
        let ctx = contextLength;
        if (!ctx) {
            if (lower.includes("1m") || lower.includes("1049k"))
                ctx = 1048576;
            else if (lower.includes("200k"))
                ctx = 204800;
            else if (lower.includes("128k") || lower.includes("131k"))
                ctx = 131072;
            else if (lower.includes("64k") || lower.includes("66k"))
                ctx = 65536;
            else if (lower.includes("32k") || lower.includes("33k"))
                ctx = 32768;
            else if (lower.includes("16k"))
                ctx = 16384;
            else if (lower.includes("8k"))
                ctx = 8192;
            else
                ctx = 131072;
        }
        return {
            providerId: this.id,
            modelId,
            displayName: modelId,
            contextLength: ctx,
            capabilities: caps,
            enabled: true,
        };
    }
}
exports.ManualProvider = ManualProvider;
