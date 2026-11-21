"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const types_1 = require("./types");
const base_1 = require("./base");
const capabilityDetector_1 = require("../models/capabilityDetector");
const BASE = "https://api.groq.com/openai/v1";
class GroqProvider {
    apiKey;
    id = "groq";
    name = "Groq";
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
            throw new types_1.ProviderError("missing_api_key", "No Groq API key", this.id, false);
        return (0, base_1.withRetry)(async () => {
            const res = await (0, base_1.withTimeout)(fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${this.apiKey}` } }), 10_000, this.id);
            if (!res.ok)
                throw (0, base_1.classifyHttpError)(res.status, await res.text(), this.id);
            const body = await res.json();
            return body.data.map((m) => {
                const caps = capabilityDetector_1.ModelCapabilityDetector.detect(this.id, m.id);
                return {
                    providerId: this.id,
                    modelId: m.id,
                    displayName: m.id,
                    contextLength: m.context_window,
                    capabilities: caps,
                    enabled: true,
                };
            });
        });
    }
    async generate(request) {
        if (!this.apiKey)
            throw new types_1.ProviderError("missing_api_key", "No Groq API key", this.id, false);
        const start = Date.now();
        return (0, base_1.withRetry)(async () => {
            const res = await (0, base_1.withTimeout)(fetch(`${BASE}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
                    temperature: request.temperature ?? 0.2,
                    max_tokens: request.maxTokens,
                }),
            }), 60_000, this.id);
            // Always capture rate-limit headers (even on error responses when headers are present)
            const quotaHeaders = (0, base_1.parseRateLimitHeaders)(res.headers);
            if (!res.ok) {
                const bodyText = await res.text();
                // Record 429 rate-limit event
                try {
                    const { getTelemetryService } = require("../usage/telemetry");
                    const svc = getTelemetryService();
                    if (res.status === 429)
                        svc.recordRateLimit(this.id, request.model, quotaHeaders.retryAfterMs);
                    svc.recordUsage({ provider: this.id, model: request.model, success: false, httpStatus: res.status, latencyMs: Date.now() - start });
                }
                catch { /* telemetry not yet init */ }
                throw (0, base_1.classifyHttpError)(res.status, bodyText, this.id, request.model);
            }
            const body = await res.json();
            const choice = body.choices?.[0];
            if (!choice)
                throw new types_1.ProviderError("invalid_response", "No choices in Groq response", this.id, false, request.model);
            return {
                text: choice.message?.content ?? "",
                usage: {
                    inputTokens: body.usage?.prompt_tokens,
                    outputTokens: body.usage?.completion_tokens,
                    durationMs: Date.now() - start,
                },
                quotaHeaders,
                raw: body,
            };
        });
    }
}
exports.GroqProvider = GroqProvider;
