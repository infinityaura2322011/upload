"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCapabilityDetector = void 0;
const capabilities_1 = require("./capabilities");
class ModelCapabilityDetector {
    /**
     * Detects full capabilities for a given model from its provider, modelId, and raw metadata.
     */
    static detect(providerId, modelId, rawMetadata) {
        const id = modelId.toLowerCase();
        // Provider-specific family rules
        switch (providerId.toLowerCase()) {
            case "groq":
                return this.detectGroq(id, rawMetadata);
            case "gemini":
                return this.detectGemini(id, rawMetadata);
            case "deepseek":
                return this.detectDeepSeek(id, rawMetadata);
            case "mistral":
                return this.detectMistral(id, rawMetadata);
            default:
                return this.detectGeneric(id, rawMetadata);
        }
    }
    static detectGroq(id, _meta) {
        // Audio / STT models (Whisper) — MUST NEVER be treated as chat or coding models
        if (id.includes("whisper")) {
            return (0, capabilities_1.defaultCapabilities)({
                chat: false,
                textGeneration: false,
                coding: false,
                reasoning: false,
                toolUse: false,
                structuredOutput: false,
                vision: false,
                audioInput: true,
                speechToText: true,
                imageGeneration: false,
                embedding: false,
                streaming: false,
            });
        }
        // Vision-capable models
        const hasVision = id.includes("vision") || id.includes("llama-3.2-11b-vision") || id.includes("llama-3.2-90b-vision");
        // Reasoning-heavy models
        const isReasoning = id.includes("r1") ||
            id.includes("70b") ||
            id.includes("mixtral") ||
            id.includes("reason");
        // Tool use supported models on Groq
        const hasTools = id.includes("llama-3") ||
            id.includes("tool") ||
            id.includes("versatile") ||
            id.includes("instant");
        return (0, capabilities_1.defaultCapabilities)({
            chat: true,
            textGeneration: true,
            coding: true,
            reasoning: isReasoning,
            toolUse: hasTools,
            structuredOutput: true,
            vision: hasVision,
            streaming: true,
        });
    }
    static detectGemini(id, _meta) {
        // Embedding models
        if (id.includes("embedding") || id.includes("aqa")) {
            return (0, capabilities_1.defaultCapabilities)({
                chat: false,
                textGeneration: false,
                coding: false,
                reasoning: false,
                embedding: true,
                streaming: false,
            });
        }
        // Imagen / Image generation
        if (id.includes("imagen") || id.includes("image")) {
            return (0, capabilities_1.defaultCapabilities)({
                chat: false,
                textGeneration: false,
                imageGeneration: true,
                streaming: false,
            });
        }
        const isPro = id.includes("pro");
        const isFlash = id.includes("flash");
        return (0, capabilities_1.defaultCapabilities)({
            chat: true,
            textGeneration: true,
            coding: true,
            reasoning: isPro || id.includes("2.5") || id.includes("2.0"),
            toolUse: isPro || isFlash,
            structuredOutput: true,
            vision: true,
            audioInput: true,
            speechToText: true,
            streaming: true,
        });
    }
    static detectDeepSeek(id, _meta) {
        const isReasoner = id.includes("reasoner") || id.includes("r1");
        const isCoder = id.includes("coder");
        return (0, capabilities_1.defaultCapabilities)({
            chat: true,
            textGeneration: true,
            coding: true,
            reasoning: isReasoner || id.includes("chat"),
            toolUse: !isReasoner, // DeepSeek reasoner does not support tools in v3
            structuredOutput: true,
            vision: false,
            streaming: true,
        });
    }
    static detectMistral(id, _meta) {
        if (id.includes("embed")) {
            return (0, capabilities_1.defaultCapabilities)({
                chat: false,
                textGeneration: false,
                embedding: true,
                streaming: false,
            });
        }
        const isCodestral = id.includes("codestral");
        const isLarge = id.includes("large") || id.includes("medium");
        const isPixtral = id.includes("pixtral");
        return (0, capabilities_1.defaultCapabilities)({
            chat: true,
            textGeneration: true,
            coding: isCodestral || isLarge,
            reasoning: isLarge || isCodestral,
            toolUse: isLarge || isCodestral,
            structuredOutput: true,
            vision: isPixtral,
            streaming: true,
        });
    }
    static detectGeneric(id, meta) {
        // Non-chat patterns
        const isWhisperOrSTT = id.includes("whisper") || id.includes("stt") || id.includes("transcribe");
        const isEmbedding = id.includes("embed") || id.includes("bge") || id.includes("nomic");
        const isTTS = id.includes("tts") || id.includes("speech") || id.includes("voice");
        const isImage = id.includes("sdxl") || id.includes("flux") || id.includes("diffusion") || id.includes("dall-e");
        if (isWhisperOrSTT) {
            return (0, capabilities_1.defaultCapabilities)({ speechToText: true, audioInput: true });
        }
        if (isEmbedding) {
            return (0, capabilities_1.defaultCapabilities)({ embedding: true });
        }
        if (isTTS) {
            return (0, capabilities_1.defaultCapabilities)({ audioInput: false });
        }
        if (isImage) {
            return (0, capabilities_1.defaultCapabilities)({ imageGeneration: true });
        }
        // Chat / coding detection
        const isCoder = id.includes("code") || id.includes("coder") || id.includes("starcoder") || id.includes("deepseek");
        const isReasoning = id.includes("reason") || id.includes("r1") || id.includes("qwq") || id.includes("70b");
        const isVision = id.includes("vision") || id.includes("vl") || id.includes("llava") || id.includes("pixtral");
        return (0, capabilities_1.defaultCapabilities)({
            chat: true,
            textGeneration: true,
            coding: isCoder || true,
            reasoning: isReasoning,
            toolUse: true,
            structuredOutput: true,
            vision: isVision,
            streaming: true,
        });
    }
}
exports.ModelCapabilityDetector = ModelCapabilityDetector;
