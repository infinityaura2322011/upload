"use strict";
// ProviderQuota schema — provider-neutral quota tracking
// source and confidence distinguish REAL from ESTIMATED from UNAVAILABLE data.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCountdown = formatCountdown;
exports.quotaFromGroqHeaders = quotaFromGroqHeaders;
/** Utility: format a countdown string from reset epoch */
function formatCountdown(resetAtMs) {
    const diff = resetAtMs - Date.now();
    if (diff <= 0)
        return "00:00";
    const totalSec = Math.ceil(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)
        return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
/** Build a ProviderQuota from Groq rate-limit headers */
function quotaFromGroqHeaders(providerId, modelId, headers) {
    const now = Date.now();
    const result = [];
    if (headers.limitRequests !== undefined || headers.remainingRequests !== undefined) {
        result.push({
            providerId, modelId,
            metric: "requests_per_minute",
            unit: "requests",
            period: "minute",
            limit: headers.limitRequests,
            remaining: headers.remainingRequests,
            used: headers.limitRequests !== undefined && headers.remainingRequests !== undefined
                ? headers.limitRequests - headers.remainingRequests
                : undefined,
            resetAt: headers.resetRequestsAt,
            source: "provider_header",
            confidence: "exact",
            fetchedAt: now,
        });
    }
    if (headers.limitTokens !== undefined || headers.remainingTokens !== undefined) {
        result.push({
            providerId, modelId,
            metric: "tokens_per_minute",
            unit: "tokens",
            period: "minute",
            limit: headers.limitTokens,
            remaining: headers.remainingTokens,
            used: headers.limitTokens !== undefined && headers.remainingTokens !== undefined
                ? headers.limitTokens - headers.remainingTokens
                : undefined,
            resetAt: headers.resetTokensAt,
            source: "provider_header",
            confidence: "exact",
            fetchedAt: now,
        });
    }
    return result;
}
