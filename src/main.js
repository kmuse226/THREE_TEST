import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';

class LargeGLBLoader {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.mixer = null;
    this.clock = new THREE.Clock();
    this.stats = {
      fps: 0,
      memory: 0,
      triangles: 0,
      fileSize: 0
    };
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.gui = null;
    this.settings = {
      wireframe: false,
      shadows: true,
      antialias: true,
      pixelRatio: window.devicePixelRatio,
      lodBias: 0,
      powerPreference: 'high-performance'
    };
    
    this.init();
    this.setupFileInput();
  }
  
  async checkWebGPUSupport() {
    const statusEl = document.getElementById('webgpu-status');
    
    if (!navigator.gpu) {
      statusEl.textContent = 'WebGPU: Not supported';
      statusEl.className = 'error';
      return false;
    }
    
    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      
      if (!adapter) {
        statusEl.textContent = 'WebGPU: No adapter found';
        statusEl.className = 'error';
        return false;
      }
      
      const device = await adapter.requestDevice();
      
      if (device) {
        statusEl.textContent = 'WebGPU: Available (Not active - use WebGPURenderer)';
        statusEl.style.color = '#ffff00';
        
        const limits = adapter.limits;
        console.log('WebGPU Limits:', {
          maxTextureSize: limits.maxTextureDimension2D,
          maxBufferSize: limits.maxBufferSize,
          maxVertexBuffers: limits.maxVertexBuffers
        });
        
        return true;
      }
    } catch (error) {
      statusEl.textContent = 'WebGPU: Error - ' + error.message;
      statusEl.className = 'error';
      return false;
    }
  }
  
  init() {
    const container = document.getElementById('canvas-container');
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.scene.fog = new THREE.Fog(0x1a1a1a, 100, 1000);
    
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    this.camera.position.set(5, 5, 5);
    
    const rendererConfig = {
      antialias: this.settings.antialias,
      powerPreference: this.settings.powerPreference,
      precision: 'highp',
      alpha: false,
      premultipliedAlpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false
    };
    
    this.renderer = new THREE.WebGLRenderer(rendererConfig);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    
    const info = this.renderer.info;
    console.log('WebGL Renderer Info:', {
      memory: info.memory,
      render: info.render,
      programs: info.programs
    });
    
    container.appendChild(this.renderer.domElement);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
    
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    
    this.setupGUI();
    this.checkWebGPUSupport();
    this.updateRendererInfo();
    
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  setupGUI() {
    this.gui = new GUI();
    
    const performanceFolder = this.gui.addFolder('Performance');
    performanceFolder.add(this.settings, 'wireframe').onChange(value => {
      if (this.model) {
        this.model.traverse(child => {
          if (child.isMesh) {
            child.material.wireframe = value;
          }
        });
      }
    });
    performanceFolder.add(this.settings, 'shadows').onChange(value => {
      this.renderer.shadowMap.enabled = value;
    });
    performanceFolder.add(this.settings, 'pixelRatio', 0.5, 2, 0.1).onChange(value => {
      this.renderer.setPixelRatio(value);
    });
    performanceFolder.add(this.settings, 'lodBias', -5, 5, 0.1).onChange(value => {
      if (this.model) {
        this.model.traverse(child => {
          if (child.isMesh && child.material.map) {
            this.renderer.capabilities.getMaxAnisotropy();
          }
        });
      }
    });
    
    const debugFolder = this.gui.addFolder('Debug');
    debugFolder.add({ logMemory: () => this.logMemoryUsage() }, 'logMemory').name('Log Memory Usage');
    debugFolder.add({ clearCache: () => this.clearCache() }, 'clearCache').name('Clear Cache');
    
    performanceFolder.open();
  }
  
  setupFileInput() {
    const fileInput = document.getElementById('glb-file');
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        this.loadGLBFile(file);
      }
    });
    
    const modelPath = './model/';
    console.log(`Place your GLB files in: ${modelPath}`);
  }
  
  loadGLBFile(file) {
    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    document.getElementById('file-size').textContent = `File Size: ${fileSize} MB`;
    this.stats.fileSize = parseFloat(fileSize);
    
    const loader = document.getElementById('loader');
    const progressBar = loader.querySelector('.progress-bar');
    const percentEl = document.getElementById('load-percent');
    loader.style.display = 'block';
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      this.loadGLBFromBuffer(arrayBuffer, (progress) => {
        const percent = Math.round(progress * 100);
        progressBar.style.width = `${percent}%`;
        percentEl.textContent = `${percent}%`;
      }).then(() => {
        loader.style.display = 'none';
      }).catch(error => {
        console.error('Error loading GLB:', error);
        loader.style.display = 'none';
        alert(`Error loading model: ${error.message}`);
      });
    };
    
    reader.readAsArrayBuffer(file);
  }
  
  async loadGLBFromBuffer(buffer, onProgress) {
    if (this.model) {
      this.scene.remove(this.model);
      this.disposeModel(this.model);
      this.model = null;
    }
    
    const loader = new GLTFLoader();
    
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);
    
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/');
    ktx2Loader.detectSupport(this.renderer);
    loader.setKTX2Loader(ktx2Loader);
    
    return new Promise((resolve, reject) => {
      loader.parse(
        buffer,
        '',
        (gltf) => {
          this.model = gltf.scene;
          
          let triangleCount = 0;
          this.model.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              if (child.geometry) {
                const geometry = child.geometry;
                if (geometry.index) {
                  triangleCount += geometry.index.count / 3;
                } else if (geometry.attributes.position) {
                  triangleCount += geometry.attributes.position.count / 3;
                }
                
                if (!geometry.attributes.normal) {
                  geometry.computeVertexNormals();
                }
                
                if (this.stats.fileSize > 500) {
                  child.frustumCulled = true;
                  
                  if (child.material) {
                    child.material.precision = 'mediump';
                  }
                }
              }
              
              if (child.material && child.material.map) {
                child.material.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
              }
            }
          });
          
          this.stats.triangles = Math.round(triangleCount);
          document.getElementById('triangles').textContent = `Triangles: ${this.stats.triangles.toLocaleString()}`;
          
          const box = new THREE.Box3().setFromObject(this.model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 10 / maxDim;
          this.model.scale.multiplyScalar(scale);
          
          this.model.position.x = -center.x * scale;
          this.model.position.y = -center.y * scale;
          this.model.position.z = -center.z * scale;
          
          this.scene.add(this.model);
          
          const distance = maxDim * 1.5;
          this.camera.position.set(distance, distance * 0.5, distance);
          this.camera.lookAt(0, 0, 0);
          this.controls.target.set(0, 0, 0);
          this.controls.update();
          
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.model);
            gltf.animations.forEach(clip => {
              this.mixer.clipAction(clip).play();
            });
          }
          
          console.log('Model loaded successfully:', {
            triangles: this.stats.triangles,
            fileSize: this.stats.fileSize + ' MB',
            boundingBox: size,
            animations: gltf.animations ? gltf.animations.length : 0
          });
          
          resolve(gltf);
        },
        onProgress,
        reject
      );
    });
  }
  
  disposeModel(model) {
    model.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => this.disposeMaterial(material));
          } else {
            this.disposeMaterial(child.material);
          }
        }
      }
    });
  }
  
  disposeMaterial(material) {
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.specularMap) material.specularMap.dispose();
    if (material.envMap) material.envMap.dispose();
    if (material.aoMap) material.aoMap.dispose();
    if (material.emissiveMap) material.emissiveMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();
    material.dispose();
  }
  
  clearCache() {
    THREE.Cache.clear();
    console.log('THREE.js cache cleared');
    
    if (this.renderer) {
      this.renderer.dispose();
      console.log('Renderer disposed');
    }
  }
  
  logMemoryUsage() {
    const info = this.renderer.info;
    console.log('Renderer Memory Info:', {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      renderCalls: info.render.calls,
      renderTriangles: info.render.triangles,
      renderPoints: info.render.points,
      renderLines: info.render.lines
    });
    
    if (performance.memory) {
      console.log('Browser Memory:', {
        used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
      });
    }
  }
  
  updateRendererInfo() {
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    
    let rendererInfo = 'WebGL';
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      rendererInfo = `${vendor} - ${renderer}`;
    }
    
    document.getElementById('renderer-info').textContent = `Renderer: ${rendererInfo}`;
  }
  
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  updateStats() {
    this.frameCount++;
    const currentTime = performance.now();
    
    if (currentTime >= this.lastTime + 1000) {
      this.stats.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      document.getElementById('fps').textContent = `FPS: ${this.stats.fps}`;
      
      if (performance.memory) {
        this.stats.memory = Math.round(performance.memory.usedJSHeapSize / 1048576);
        document.getElementById('memory').textContent = `Memory: ${this.stats.memory} MB`;
      }
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const delta = this.clock.getDelta();
    
    if (this.mixer) {
      this.mixer.update(delta);
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateStats();
  }
  
  start() {
    this.animate();
  }
}

const app = new LargeGLBLoader();
app.start();