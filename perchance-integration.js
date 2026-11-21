// Complete Perchance Integration
// - Auto-enhance prompts via brain icon
// - Generate multiple results
// - Show results in chat area
// - Save and convert to 3D

const PERCHANCE_INTEGRATION = {
  currentGenerator: null,
  generatedResults: [],
  enhancedPrompt: null,
  defaultPrompt: 'Generate a high-quality result',
  brainClickDelay: 1500,
  enhancementWaitTime: 2500,
  generateClickDelay: 4000,
  pollInterval: 500,
  maxPolls: 60 // 30 seconds max wait
};

// Find brain button in Perchance UI
function findBrainButton() {
  const selectors = [
    '#enhancePromptButton',
    'button[title*="enhance" i]',
    'button[title*="brain" i]',
    'button[aria-label*="enhance" i]',
    'button[aria-label*="brain" i]',
    '.enhance-btn',
    '#brainButton',
    'button.brain',
    'button[onclick*="enhance" i]'
  ];
  
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    } catch (e) {}
  }
  return null;
}

// Find prompt textarea
function findPromptTextarea() {
  const selectors = [
    '#promptTextarea',
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    '.prompt-input textarea',
    '#userPrompt',
    'textarea'
  ];
  
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    } catch (e) {}
  }
  return null;
}

// Find generate button
function findGenerateButton() {
  const selectors = [
    '#generateButton',
    'button[onclick*="generate" i]',
    'button[title*="generate" i]',
    'button[aria-label*="generate" i]',
    '.generate-btn',
    '#createButton',
    'button.generate'
  ];
  
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    } catch (e) {}
  }
  return null;
}

// Set textarea value
function setTextareaValue(textarea, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(textarea, value);
  } else {
    textarea.value = value;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

// Click brain button to enhance prompt
async function clickBrainButton() {
  return new Promise((resolve) => {
    const brainBtn = findBrainButton();
    if (!brainBtn) {
      console.log('Brain button not found');
      resolve(false);
      return;
    }

    brainBtn.click();
    console.log('Brain button clicked');

    // Wait for enhancement modal/dialog
    setTimeout(() => {
      resolve(true);
    }, PERCHANCE_INTEGRATION.brainClickDelay);
  });
}

// Wait for enhancement to complete
async function waitForEnhancement() {
  return new Promise((resolve) => {
    const textarea = findPromptTextarea();
    if (!textarea) {
      resolve(null);
      return;
    }

    const originalValue = textarea.value;
    let pollCount = 0;

    const checkInterval = setInterval(() => {
      pollCount++;
      const currentValue = textarea.value;

      // Check if prompt changed (enhanced)
      if (currentValue !== originalValue || pollCount >= PERCHANCE_INTEGRATION.maxPolls) {
        clearInterval(checkInterval);
        resolve(currentValue);
      }
    }, PERCHANCE_INTEGRATION.pollInterval);

    // Timeout fallback
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(textarea.value);
    }, PERCHANCE_INTEGRATION.enhancementWaitTime);
  });
}

// Auto-enhance prompt via brain icon
async function autoEnhancePrompt(prompt) {
  const textarea = findPromptTextarea();
  if (!textarea) {
    console.error('Prompt textarea not found');
    return prompt;
  }

  // Set initial prompt
  setTextareaValue(textarea, prompt);

  // Click brain button
  const brainClicked = await clickBrainButton();
  if (!brainClicked) {
    console.log('Brain button not available, using original prompt');
    return prompt;
  }

  // Wait for enhancement
  const enhanced = await waitForEnhancement();
  return enhanced || prompt;
}

// Click generate button
async function clickGenerateButton() {
  return new Promise((resolve) => {
    const genBtn = findGenerateButton();
    if (!genBtn) {
      console.error('Generate button not found');
      resolve(false);
      return;
    }

    genBtn.click();
    console.log('Generate button clicked');
    resolve(true);
  });
}

// Send prompt to Perchance with brain enhancement
async function sendToPerchanceWithBrain(prompt, shouldEnhance = true) {
  try {
    const textarea = findPromptTextarea();
    if (!textarea) {
      throw new Error('Prompt textarea not found');
    }

    // Auto-enhance if requested
    let finalPrompt = prompt;
    if (shouldEnhance) {
      console.log('Auto-enhancing prompt via brain icon...');
      finalPrompt = await autoEnhancePrompt(prompt);
      PERCHANCE_INTEGRATION.enhancedPrompt = finalPrompt;
    } else {
      setTextareaValue(textarea, prompt);
    }

    // Wait before clicking generate
    await new Promise(r => setTimeout(r, PERCHANCE_INTEGRATION.generateClickDelay));

    // Click generate
    const generated = await clickGenerateButton();
    
    return {
      success: generated,
      prompt: finalPrompt,
      enhanced: shouldEnhance
    };
  } catch (err) {
    console.error('Error sending to Perchance:', err);
    return { success: false, error: err.message };
  }
}

// Fallback: Use default prompt if enhancement fails
async function sendWithFallback(prompt) {
  try {
    const result = await sendToPerchanceWithBrain(prompt, true);
    if (!result.success) {
      console.log('Enhancement failed, falling back to default prompt');
      return await sendToPerchanceWithBrain(
        PERCHANCE_INTEGRATION.defaultPrompt,
        false
      );
    }
    return result;
  } catch (err) {
    console.error('Fallback failed:', err);
    return { success: false, error: err.message };
  }
}

// Capture generated images from Perchance
async function captureGeneratedImages() {
  return new Promise((resolve) => {
    // Wait for images to load
    setTimeout(() => {
      const images = [];
      
      // Try multiple selectors for generated images
      const selectors = [
        'img[src*="generated"]',
        '.generated-image img',
        '.output-image img',
        '.result img',
        '#outputImage',
        '#generatedImage',
        '#resultImage'
      ];

      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            if (el.src && el.src.startsWith('http')) {
              images.push({
                url: el.src,
                alt: el.alt || 'Generated image',
                timestamp: Date.now()
              });
            }
          });
        } catch (e) {}
      }

      // Also check canvas elements
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        try {
          const url = canvas.toDataURL('image/png');
          if (url && url !== 'data:,') {
            images.push({
              url: url,
              alt: 'Generated from canvas',
              timestamp: Date.now()
            });
          }
        } catch (e) {}
      });

      PERCHANCE_INTEGRATION.generatedResults = images;
      resolve(images);
    }, 3000); // Wait 3 seconds for images to render
  });
}

// Display results in chat area
function displayResultsInChat(results) {
  if (!results || results.length === 0) {
    console.log('No results to display');
    return;
  }

  const chatArea = document.getElementById('asset-results') || 
                   document.getElementById('gen-results') ||
                   document.createElement('div');

  chatArea.innerHTML = '';
  chatArea.style.display = 'grid';
  chatArea.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
  chatArea.style.gap = '12px';
  chatArea.style.padding = '16px';

  results.forEach((result, idx) => {
    const card = document.createElement('div');
    card.className = 'generated-result-card';
    card.style.cssText = `
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: var(--panel);
      cursor: pointer;
      transition: all 0.2s;
    `;

    card.innerHTML = `
      <div style="position: relative; overflow: hidden; height: 200px; background: var(--canvas);">
        <img src="${result.url}" alt="${result.alt}" 
             style="width: 100%; height: 100%; object-fit: cover;">
      </div>
      <div style="padding: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-primary small" onclick="saveGeneratedImage('${result.url}', ${idx})">
          💾 Save
        </button>
        <button class="btn-ghost small" onclick="convertTo3D('${result.url}', ${idx})">
          🎲 Make 3D
        </button>
        <button class="btn-ghost small" onclick="useInTask('${result.url}', ${idx})">
          📋 Use
        </button>
      </div>
    `;

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--cyan)';
      card.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.2)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--line)';
      card.style.boxShadow = 'none';
    });

    chatArea.appendChild(card);
  });

  // Scroll into view
  chatArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Save generated image
async function saveGeneratedImage(imageUrl, index) {
  try {
    const res = await fetch(`${API}/api/assets/save-generated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        index: index,
        timestamp: Date.now()
      })
    });

    const data = await res.json();
    if (res.ok) {
      addEvent('ASSET', `Saved generated image #${index + 1} → ${data.path}`);
    } else {
      throw new Error(data.error || 'Save failed');
    }
  } catch (err) {
    addEvent('ERROR', `Failed to save image: ${err.message}`, true);
  }
}

// Convert to 3D
async function convertTo3D(imageUrl, index) {
  try {
    if (!window.confirm(`Convert image #${index + 1} to a 3D model?`)) return;
    // Navigate to 3D generator
    const gen3d = window.PERCHANCE_GENERATORS?.find(g => g.id === '3d');
    if (!gen3d) {
      throw new Error('3D generator not found');
    }

    navigateBrowserTo(gen3d.url);

    // Wait for page load
    await new Promise(r => setTimeout(r, 2000));

    // Set prompt for 3D generation
    const prompt = `Create a 3D model based on this image. Make it detailed and suitable for game/project use.`;
    
    // Send to 3D generator with brain enhancement
    await sendToPerchanceWithBrain(prompt, true);

    addEvent('GENERATOR', `Converting image #${index + 1} to 3D model...`);
  } catch (err) {
    addEvent('ERROR', `3D conversion failed: ${err.message}`, true);
  }
}

// Use in task
async function useInTask(imageUrl, index) {
  try {
    const taskEl = document.getElementById('prompt');
    if (!taskEl) {
      throw new Error('Task prompt area not found');
    }

    const prompt = PERCHANCE_INTEGRATION.enhancedPrompt || 'Generated image';
    taskEl.value += (taskEl.value ? '\n\n' : '') + 
                    `[Generated Image #${index + 1}]\n` +
                    `Prompt: ${prompt}\n` +
                    `URL: ${imageUrl}`;

    addEvent('GENERATOR', `Image #${index + 1} added to task prompt`);
    
    // Switch to home view
    document.querySelector('.nav-btn[data-view="home"]')?.click();
  } catch (err) {
    addEvent('ERROR', `Failed to add to task: ${err.message}`, true);
  }
}

// Main workflow: Generate with brain enhancement
async function generateWithBrainEnhancement(prompt, generatorId) {
  try {
    addEvent('GENERATOR', `Starting generation with brain enhancement...`);

    // Send to Perchance with brain enhancement
    const result = await sendWithFallback(prompt);
    
    if (!result.success) {
      throw new Error('Generation failed');
    }

    addEvent('GENERATOR', `Prompt enhanced: "${result.prompt.substring(0, 80)}..."`);

    // Capture generated images
    const images = await captureGeneratedImages();
    
    if (images.length === 0) {
      addEvent('GENERATOR', 'No images captured, waiting longer...');
      await new Promise(r => setTimeout(r, 3000));
      const retryImages = await captureGeneratedImages();
      if (retryImages.length > 0) {
        displayResultsInChat(retryImages);
      }
    } else {
      displayResultsInChat(images);
    }

    addEvent('GENERATOR', `Generated ${images.length} results`);
  } catch (err) {
    addEvent('ERROR', `Generation workflow failed: ${err.message}`, true);
  }
}

// Export for use in main app
window.PerchanceIntegration = {
  sendToPerchanceWithBrain,
  sendWithFallback,
  captureGeneratedImages,
  displayResultsInChat,
  saveGeneratedImage,
  convertTo3D,
  useInTask,
  generateWithBrainEnhancement,
  config: PERCHANCE_INTEGRATION
};
