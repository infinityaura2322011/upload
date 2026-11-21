// Vision Service - Lightweight image understanding for Ollama
// Uses llava:7b or bakllava for image analysis

const VISION_CONFIG = {
  ollamaUrl: 'http://localhost:11434',
  visionModel: 'llava:7b',
  timeout: 30000,
  maxImageSize: 5242880 // 5MB
};

// Check if Ollama is running
async function checkOllamaHealth() {
  try {
    const res = await fetch(`${VISION_CONFIG.ollamaUrl}/api/tags`, {
      timeout: 5000
    });
    return res.ok;
  } catch (err) {
    console.warn('Ollama not available:', err.message);
    return false;
  }
}

// Get available vision models
async function getAvailableVisionModels() {
  try {
    const res = await fetch(`${VISION_CONFIG.ollamaUrl}/api/tags`);
    const data = await res.json();
    return data.models
      .filter(m => m.name.includes('llava') || m.name.includes('bakllava') || m.name.includes('vision'))
      .map(m => m.name);
  } catch (err) {
    console.error('Failed to get vision models:', err);
    return [];
  }
}

// Analyze image using Ollama vision model
async function analyzeImageWithOllama(imagePath) {
  try {
    // Read image file
    const imageData = await readImageAsBase64(imagePath);
    if (!imageData) {
      throw new Error('Could not read image file');
    }

    // Call Ollama vision model
    const res = await fetch(`${VISION_CONFIG.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_CONFIG.visionModel,
        prompt: 'Describe this image in detail. What do you see? What are the main elements, colors, style, mood, and any text visible?',
        images: [imageData],
        stream: false
      }),
      timeout: VISION_CONFIG.timeout
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status}`);
    }

    const data = await res.json();
    return data.response || '';
  } catch (err) {
    console.error('Vision analysis failed:', err);
    return null;
  }
}

// Read image file as base64
async function readImageAsBase64(imagePath) {
  try {
    // If running in Electron
    if (window.electronAPI?.readFile) {
      const buffer = await window.electronAPI.readFile(imagePath);
      return buffer.toString('base64');
    }

    // Browser fallback - fetch from server
    const res = await fetch(`/api/file/read?path=${encodeURIComponent(imagePath)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to read image:', err);
    return null;
  }
}

// Generate image description for prompt enhancement
async function generateImageDescription(imagePath) {
  const isHealthy = await checkOllamaHealth();
  if (!isHealthy) {
    console.warn('Ollama not available, skipping image analysis');
    return null;
  }

  const description = await analyzeImageWithOllama(imagePath);
  if (!description) return null;

  // Format as prompt enhancement
  return `[Image Analysis]\n${description}\n[Use this as reference for generation]`;
}

// Enhance prompt with image context
async function enhancePromptWithImage(prompt, imagePath) {
  const description = await generateImageDescription(imagePath);
  if (!description) return prompt;

  return `${prompt}\n\n${description}`;
}

// Batch analyze multiple images
async function analyzeMultipleImages(imagePaths) {
  const results = {};
  
  for (const path of imagePaths) {
    const desc = await generateImageDescription(path);
    if (desc) {
      results[path] = desc;
    }
  }

  return results;
}

// Export for use in main app
window.VisionService = {
  checkOllamaHealth,
  getAvailableVisionModels,
  analyzeImageWithOllama,
  generateImageDescription,
  enhancePromptWithImage,
  analyzeMultipleImages,
  config: VISION_CONFIG
};
