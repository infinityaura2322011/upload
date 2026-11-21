"use strict";
// Coding Monster — Unified provider type definitions
// ModelCapabilities is now capability-complete (12 dimensions).
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_REQUIRED_CAPS = exports.ROLE_DISPLAY = exports.DEFAULT_PROJECT_SETTINGS = exports.ProviderError = void 0;
class ProviderError extends Error {
    kind;
    providerId;
    retryable;
    modelId;
    constructor(kind, message, providerId, retryable, modelId) {
        super(message);
        this.kind = kind;
        this.providerId = providerId;
        this.retryable = retryable;
        this.modelId = modelId;
        this.name = "ProviderError";
    }
}
exports.ProviderError = ProviderError;
exports.DEFAULT_PROJECT_SETTINGS = {
    contentRating: "EVERYONE",
    minContentRating: "EVERYONE",
    ageGateEnabled: false,
    strictLicenseMode: false,
    allowMatureAssets: false,
    assetSearchEnabled: true,
    automaticDownloads: false,
};
/** Human-readable display names for each role */
exports.ROLE_DISPLAY = {
    planner: "Planner",
    designer: "Designer",
    uiDesigner: "UI Designer",
    systemArchitect: "System Architect",
    architect: "Software Architect",
    frontendCoder: "Frontend Coder",
    backendCoder: "Backend Coder",
    altCoder: "Alt Coder",
    dbEngineer: "Database Engineer",
    algorithmEngineer: "Algorithm Engineer",
    securityEngineer: "Security Engineer",
    engineeringReviewer: "Engineering Reviewer",
    codeReviewer: "Code Reviewer",
    refactorer: "Refactorer",
    debugger: "Debugger",
    tester: "Tester",
    performanceEngineer: "Performance Engineer",
    docEngineer: "Documentation Engineer",
    finalJudge: "Final Judge",
    releaseEngineer: "Release Engineer",
    assetEngineer: "Asset Engineer",
    unityCoder: "Unity Coder",
    unrealCoder: "Unreal Coder",
    gameplayCoder: "Gameplay Coder",
    uiEngineer: "UI Engineer",
    animationEngineer: "Animation Engineer",
    audioEngineer: "Audio Engineer",
    securityReviewer: "Security Reviewer",
    licenseReviewer: "License Reviewer",
    gameDesigner: "Game Designer",
};
/** Required capabilities per role */
exports.ROLE_REQUIRED_CAPS = {
    planner: ["chat", "textGeneration"],
    designer: ["chat", "textGeneration"],
    uiDesigner: ["chat", "textGeneration"],
    systemArchitect: ["chat", "textGeneration"],
    architect: ["chat", "textGeneration"],
    frontendCoder: ["chat", "textGeneration"],
    backendCoder: ["chat", "textGeneration"],
    altCoder: ["chat", "textGeneration"],
    dbEngineer: ["chat", "textGeneration"],
    algorithmEngineer: ["chat", "textGeneration"],
    securityEngineer: ["chat", "textGeneration"],
    engineeringReviewer: ["chat", "textGeneration"],
    codeReviewer: ["chat", "textGeneration"],
    refactorer: ["chat", "textGeneration"],
    debugger: ["chat", "textGeneration"],
    tester: ["chat", "textGeneration"],
    performanceEngineer: ["chat", "textGeneration"],
    docEngineer: ["chat", "textGeneration"],
    finalJudge: ["chat", "textGeneration"],
    releaseEngineer: ["chat", "textGeneration"],
    assetEngineer: ["chat", "textGeneration"],
    unityCoder: ["chat", "textGeneration"],
    unrealCoder: ["chat", "textGeneration"],
    gameplayCoder: ["chat", "textGeneration"],
    uiEngineer: ["chat", "textGeneration"],
    animationEngineer: ["chat", "textGeneration"],
    audioEngineer: ["chat", "textGeneration"],
    securityReviewer: ["chat", "textGeneration"],
    licenseReviewer: ["chat", "textGeneration"],
    gameDesigner: ["chat", "textGeneration"],
};
