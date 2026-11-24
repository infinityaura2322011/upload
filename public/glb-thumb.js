// glb-thumb.js — On-demand single-frame Three.js thumbnail renderer for .GLB / .GLTF / .VRM assets.
// Uses a shared offscreen WebGLRenderer sequentially (no 60fps loop) and caches data URLs in memory.

(function () {
  const thumbCache = new Map();
  const queue = [];
  let active = false;
  let threePromise = null;
  let sharedRenderer = null;

  async function loadThree() {
    if (!threePromise) {
      threePromise = Promise.all([
        import('https://esm.sh/three@0.170.0'),
        import('https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'),
      ]).then(([THREE, loaderMod]) => ({ THREE, GLTFLoader: loaderMod.GLTFLoader }));
    }
    return threePromise;
  }

  function getRenderer(THREE) {
    if (sharedRenderer) return sharedRenderer;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 176;
    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    sharedRenderer.setSize(256, 176, false);
    sharedRenderer.setPixelRatio(1);
    return sharedRenderer;
  }

  async function renderSingle(url) {
    if (thumbCache.has(url)) return thumbCache.get(url);
    try {
      const { THREE, GLTFLoader } = await loadThree();
      const renderer = getRenderer(THREE);
      const scene = new THREE.Scene();

      // Subtle Obsidian-Amethyst studio backdrop & rim lights
      const hemi = new THREE.HemisphereLight(0xe9d5ff, 0x160a2e, 1.35);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 1.85);
      key.position.set(2.5, 4, 3.2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xa855f7, 1.3);
      rim.position.set(-3, 2, -2.5);
      scene.add(rim);

      const loader = new GLTFLoader();
      const gltf = await Promise.race([
        new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('3D thumb timeout')), 12000)),
      ]);

      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error('Empty GLTF scene');
      scene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      root.position.sub(center);

      const camera = new THREE.PerspectiveCamera(36, 256 / 176, 0.05, maxDim * 20);
      const dist = maxDim * 1.95;
      camera.position.set(dist * 0.52, dist * 0.32, dist * 0.88);
      camera.lookAt(0, 0, 0);

      renderer.setClearColor(0x0b0618, 1);
      renderer.render(scene, camera);

      const dataUrl = renderer.domElement.toDataURL('image/png');
      // Dispose scene GPU buffers immediately
      root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m?.dispose?.());
        }
      });
      thumbCache.set(url, dataUrl);
      return dataUrl;
    } catch {
      thumbCache.set(url, null);
      return null;
    }
  }

  async function processQueue() {
    if (active) return;
    active = true;
    while (queue.length > 0) {
      const { url, resolve } = queue.shift();
      const res = await renderSingle(url);
      resolve(res);
    }
    active = false;
  }

  function renderGlbThumbnail(url) {
    if (!url) return Promise.resolve(null);
    if (thumbCache.has(url)) return Promise.resolve(thumbCache.get(url));
    return new Promise((resolve) => {
      queue.push({ url, resolve });
      processQueue();
    });
  }

  function hydrateGlbThumbnail(imgEl, url, fallbackEl) {
    if (!imgEl || !url) return;
    renderGlbThumbnail(url).then((dataUrl) => {
      if (dataUrl && imgEl.isConnected) {
        imgEl.src = dataUrl;
        imgEl.style.display = 'block';
        if (fallbackEl) fallbackEl.style.display = 'none';
      }
    });
  }

  window.GlbThumbRenderer = {
    renderGlbThumbnail,
    hydrateGlbThumbnail,
  };
})();
