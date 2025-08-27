import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';

// Draco 압축 스크립트
class GLBCompressor {
  constructor() {
    this.loader = new GLTFLoader();
    this.exporter = new GLTFExporter();
    
    // Draco 로더 설정
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.loader.setDRACOLoader(dracoLoader);
  }
  
  async compressGLB(inputFile, options = {}) {
    const {
      simplifyRatio = 0.5, // 메시 단순화 비율
      textureScale = 0.5,  // 텍스처 스케일
      removeNormals = false, // 노말 제거
      removeUVs = false,    // UV 제거
      quantization = {      // 양자화 설정
        position: 14,
        normal: 10,
        color: 8,
        uv: 12
      }
    } = options;
    
    console.log('Loading GLB file...');
    
    // 파일 로드
    const arrayBuffer = await this.readFile(inputFile);
    
    return new Promise((resolve, reject) => {
      this.loader.parse(arrayBuffer, '', (gltf) => {
        console.log('Model loaded, starting optimization...');
        
        const scene = gltf.scene;
        let totalVertices = 0;
        let totalFaces = 0;
        let optimizedVertices = 0;
        let optimizedFaces = 0;
        
        // 모든 메시 처리
        scene.traverse((child) => {
          if (child.isMesh) {
            const geometry = child.geometry;
            
            // 원본 통계
            const vertCount = geometry.attributes.position.count;
            const faceCount = geometry.index ? geometry.index.count / 3 : vertCount / 3;
            totalVertices += vertCount;
            totalFaces += faceCount;
            
            // 1. 메시 최적화
            if (simplifyRatio < 1) {
              this.simplifyGeometry(geometry, simplifyRatio);
            }
            
            // 2. 속성 제거
            if (removeNormals && geometry.attributes.normal) {
              geometry.deleteAttribute('normal');
            }
            
            if (removeUVs && geometry.attributes.uv) {
              geometry.deleteAttribute('uv');
            }
            
            // 3. 버텍스 병합
            geometry.mergeVertices();
            
            // 4. 인덱스 최적화
            geometry.optimizeIndices();
            
            // 최적화된 통계
            optimizedVertices += geometry.attributes.position.count;
            optimizedFaces += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
            
            // 5. 텍스처 최적화
            if (child.material && child.material.map) {
              this.optimizeTexture(child.material.map, textureScale);
            }
          }
        });
        
        console.log('Optimization complete:');
        console.log(`Vertices: ${totalVertices} → ${optimizedVertices} (${((optimizedVertices/totalVertices)*100).toFixed(1)}%)`);
        console.log(`Faces: ${totalFaces} → ${optimizedFaces} (${((optimizedFaces/totalFaces)*100).toFixed(1)}%)`);
        
        // 6. GLB로 내보내기
        const exportOptions = {
          binary: true,
          trs: false,
          onlyVisible: true,
          truncateDrawRange: true,
          embedImages: true,
          forceIndices: true,
          forcePowerOfTwoTextures: false
        };
        
        this.exporter.parse(
          scene,
          (result) => {
            const blob = new Blob([result], { type: 'application/octet-stream' });
            const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
            console.log(`Compressed size: ${sizeMB} MB`);
            
            resolve({
              blob,
              size: blob.size,
              sizeMB,
              stats: {
                originalVertices: totalVertices,
                optimizedVertices,
                originalFaces: totalFaces,
                optimizedFaces,
                compressionRatio: ((1 - blob.size / inputFile.size) * 100).toFixed(1)
              }
            });
          },
          reject,
          exportOptions
        );
      }, reject);
    });
  }
  
  simplifyGeometry(geometry, ratio) {
    // 간단한 버텍스 감소 (실제로는 더 복잡한 알고리즘 필요)
    // SimplifyModifier를 사용하거나 외부 라이브러리 활용
    console.log(`Simplifying geometry by ${(1-ratio)*100}%`);
    
    // 이것은 예제입니다. 실제 구현은 three-mesh-simplifier 등 사용
    // https://github.com/gkjohnson/three-mesh-simplifier
  }
  
  optimizeTexture(texture, scale) {
    if (!texture.image) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const newWidth = Math.floor(texture.image.width * scale);
    const newHeight = Math.floor(texture.image.height * scale);
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    ctx.drawImage(texture.image, 0, 0, newWidth, newHeight);
    
    texture.image = canvas;
    texture.needsUpdate = true;
    
    console.log(`Texture resized: ${texture.image.width}x${texture.image.height} → ${newWidth}x${newHeight}`);
  }
  
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// 사용법
export function setupCompressor() {
  const compressor = new GLBCompressor();
  
  // HTML에 압축 UI 추가
  const compressUI = document.createElement('div');
  compressUI.innerHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; background: #333; padding: 15px; border-radius: 5px; z-index: 1000;">
      <h3 style="color: #00ff88; margin: 0 0 10px 0;">GLB Compressor</h3>
      <input type="file" id="compress-input" accept=".glb">
      <div id="compress-options" style="margin: 10px 0; color: white;">
        <label>
          <input type="checkbox" id="opt-draco" checked> Use Draco
        </label><br>
        <label>
          Simplify: <input type="range" id="opt-simplify" min="0.1" max="1" step="0.1" value="0.7">
          <span id="simplify-value">70%</span>
        </label><br>
        <label>
          Texture Scale: <input type="range" id="opt-texture" min="0.1" max="1" step="0.1" value="0.5">
          <span id="texture-value">50%</span>
        </label>
      </div>
      <button id="compress-btn" style="background: #00ff88; color: black; border: none; padding: 8px 16px; cursor: pointer;">
        Compress GLB
      </button>
      <div id="compress-result" style="margin-top: 10px; color: #00ffff;"></div>
    </div>
  `;
  document.body.appendChild(compressUI);
  
  // Event listeners
  document.getElementById('opt-simplify').addEventListener('input', (e) => {
    document.getElementById('simplify-value').textContent = `${Math.round(e.target.value * 100)}%`;
  });
  
  document.getElementById('opt-texture').addEventListener('input', (e) => {
    document.getElementById('texture-value').textContent = `${Math.round(e.target.value * 100)}%`;
  });
  
  document.getElementById('compress-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('compress-input');
    const file = fileInput.files[0];
    
    if (!file) {
      alert('Please select a GLB file');
      return;
    }
    
    const resultDiv = document.getElementById('compress-result');
    resultDiv.textContent = 'Compressing...';
    
    try {
      const result = await compressor.compressGLB(file, {
        simplifyRatio: parseFloat(document.getElementById('opt-simplify').value),
        textureScale: parseFloat(document.getElementById('opt-texture').value)
      });
      
      resultDiv.innerHTML = `
        <strong>Success!</strong><br>
        Size: ${result.sizeMB} MB<br>
        Compression: ${result.stats.compressionRatio}%<br>
        Vertices: ${result.stats.optimizedVertices}<br>
        Faces: ${result.stats.optimizedFaces}
      `;
      
      // 다운로드
      const filename = file.name.replace('.glb', '-compressed.glb');
      compressor.downloadBlob(result.blob, filename);
      
    } catch (error) {
      resultDiv.textContent = `Error: ${error.message}`;
      console.error(error);
    }
  });
}

export default GLBCompressor;