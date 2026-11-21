"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCapabilities = defaultCapabilities;
exports.getActiveBadges = getActiveBadges;
function defaultCapabilities(overrides = {}) {
    return {
        chat: false,
        textGeneration: false,
        coding: false,
        reasoning: false,
        toolUse: false,
        structuredOutput: false,
        vision: false,
        audioInput: false,
        speechToText: false,
        imageGeneration: false,
        embedding: false,
        streaming: true,
        ...overrides,
    };
}
function getActiveBadges(caps) {
    const badges = [];
    if (caps.chat)
        badges.push("CHAT");
    if (caps.coding)
        badges.push("CODE");
    if (caps.reasoning)
        badges.push("REASON");
    if (caps.toolUse)
        badges.push("TOOLS");
    if (caps.structuredOutput)
        badges.push("JSON");
    if (caps.vision)
        badges.push("VISION");
    if (caps.speechToText)
        badges.push("STT");
    if (caps.audioInput)
        badges.push("AUDIO");
    if (caps.imageGeneration)
        badges.push("IMAGE");
    if (caps.embedding)
        badges.push("EMBED");
    if (caps.streaming)
        badges.push("STREAM");
    return badges;
}
