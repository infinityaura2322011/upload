"use strict";
// Shared JSON extraction utility used by all agents.
// Models sometimes wrap JSON in markdown fences — this strips them.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractJson = extractJson;
exports.callAgent = callAgent;
function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1)
        throw new Error("No JSON object found in response");
    return JSON.parse(raw.slice(start, end + 1));
}
async function callAgent(provider, modelId, request, schema) {
    const response = await provider.generate({
        ...request,
        model: modelId,
        jsonSchema: request.jsonSchema ?? { type: "object" },
    });
    const raw = extractJson(response.text);
    const result = schema.safeParse(raw);
    if (result.success)
        return result.data;
    // Surface a compact, readable error instead of the full Zod JSON blob
    const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message} (got ${JSON.stringify(i.received ?? "?")})`)
        .join("; ");
    throw new Error(`Schema validation failed: ${issues}`);
}
