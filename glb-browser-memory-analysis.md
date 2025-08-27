# 브라우저에서 대용량 GLB 파일 로딩 문제 분석 보고서

## 목차
1. [문제 정의](#문제-정의)
2. [브라우저 메모리 구조](#브라우저-메모리-구조)
3. [ArrayBuffer 제한](#arraybuffer-제한)
4. [GLB 로딩 프로세스](#glb-로딩-프로세스)
5. [브라우저별 차이점](#브라우저별-차이점)
6. [해결 방안](#해결-방안)
7. [결론 및 권고사항](#결론-및-권고사항)

---

## 문제 정의

### 현상
- 2.5GB GLB 파일을 Chrome에서 로드 시 실패
- Firefox에서는 로드되지만 매우 느림 (30-60초)
- JavaScript Heap 메모리는 충분함 (4GB 제한)

### 원인
**JavaScript ArrayBuffer의 2GB 크기 제한이 근본 원인**

```javascript
// Chrome에서 실패하는 코드
const response = await fetch('model.glb');  // 2.5GB
const arrayBuffer = await response.arrayBuffer(); // ❌ RangeError: ArrayBuffer allocation failed
```

### 오해와 진실
- ❌ "브라우저 메모리 부족" → 실제로는 충분함 (최대 1TB)
- ❌ "GPU 메모리 부족" → GPU까지 도달하지 못함
- ✅ **"ArrayBuffer 2GB 제한"** → 정확한 원인

---

## 브라우저 메모리 구조

### 메모리 계층도

```
시스템 RAM (예: 16GB, 32GB)
    │
    ├── Browser Process (500MB ~ 1GB)
    │   └── UI, 네트워크, 파일 시스템 관리
    │
    ├── Renderer Process (탭당, 최대 1TB - Windows 2023)
    │   ├── JavaScript Heap (4GB)
    │   ├── ArrayBuffer Pool (별도 관리) ⚠️
    │   ├── DOM Memory
    │   └── Network Cache
    │
    └── GPU Process
        ├── GPU Memory (VRAM)
        └── WebGL 버퍼 (512MB ~ 2GB 제한)
```

### 주요 메모리 영역별 제한

| 메모리 영역 | 크기 제한 | 용도 | GLB 관련 |
|------------|---------|------|---------|
| **JS Heap** | 4GB | JS 객체, 변수 | Three.js 씬 그래프 |
| **ArrayBuffer Pool** | 2GB (Chrome) / 8GB (Firefox) | 바이너리 데이터 | **🚨 GLB 파일 로드** |
| **GPU Memory** | 512MB ~ 2GB | 렌더링 | 텍스처, 버텍스 |
| **Renderer Process** | 1TB (최신) | 전체 탭 메모리 | - |

### performance.memory 해석
```javascript
{
    jsHeapSizeLimit: 4294705152,  // 4GB - JS 객체 제한
    totalJSHeapSize: 44849014,     // 현재 할당된 JS 메모리
    usedJSHeapSize: 30273578       // 실제 사용중인 JS 메모리
}
// 참고: ArrayBuffer는 이 수치에 포함되지 않음
```

---

## ArrayBuffer 제한

### ArrayBuffer란?
- 고정 크기의 원시 바이너리 데이터 컨테이너
- 직접 접근 불가, TypedArray를 통해 접근
- 연속된 메모리 블록 필요

### 브라우저별 ArrayBuffer 최대 크기

| 브라우저 | JS 엔진 | ArrayBuffer 최대 | 2.5GB 로드 |
|---------|---------|----------------|-----------|
| **Chrome** | V8 | 2GB (2^31-1 bytes) | ❌ 불가능 |
| **Firefox** | SpiderMonkey | 8GB | ✅ 가능 (느림) |
| **Safari** | JavaScriptCore | 4GB | ✅ 가능 |
| **Edge** | V8 | 2GB | ❌ 불가능 |

### 제한 이유
```javascript
// V8 엔진 내부 제한
static constexpr size_t kMaxLength = 0x7FFFFFFF; // 2,147,483,647 bytes
// 32비트 정수 인덱싱 사용 (2^31 - 1)
```

### ArrayBuffer vs TypedArray
```javascript
// ArrayBuffer: 메모리 공간 할당 (밀봉된 상자)
const buffer = new ArrayBuffer(16);  // 16바이트 공간

// TypedArray: 데이터 접근 인터페이스 (상자를 보는 안경)
const int32View = new Int32Array(buffer);  // 4개의 32비트 정수로 해석
const float32View = new Float32Array(buffer);  // 4개의 부동소수점으로 해석
```

---

## GLB 로딩 프로세스

### GLTFLoader 내부 동작

```javascript
// Three.js GLTFLoader 흐름
class GLTFLoader {
    load(url, onLoad) {
        // 1. 파일 다운로드
        fetch(url)
            // 2. ArrayBuffer로 변환 (문제 발생 지점!)
            .then(response => response.arrayBuffer())
            // 3. GLB 파싱
            .then(buffer => this.parseGLB(buffer))
            // 4. GPU 업로드
            .then(gltf => this.uploadToGPU(gltf));
    }
    
    parseGLB(arrayBuffer) {
        const dataView = new DataView(arrayBuffer);
        
        // GLB 헤더 읽기
        const magic = dataView.getUint32(0, true);     // "glTF"
        const version = dataView.getUint32(4, true);   // 버전 2
        const length = dataView.getUint32(8, true);    // 파일 크기
        
        // JSON 청크 파싱
        // Binary 청크 파싱
        // ...
    }
}
```

### 2.5GB GLB 파일 구조 예시

```
GLB 파일 (2.5GB)
├── Header (12 bytes)
├── JSON Chunk (~1MB) - 메타데이터
└── Binary Chunk (2.499GB)
    ├── Vertices (500MB) - 정점 좌표
    ├── Normals (300MB) - 법선 벡터
    ├── UV Coords (200MB) - 텍스처 좌표
    ├── Indices (100MB) - 면 인덱스
    └── Textures (1.4GB) - 텍스처 이미지 (가장 큰 부분)
```

### 메모리 플로우

```
[서버] 2.5GB 파일
    ↓
[Network Cache] ✅ 다운로드 성공
    ↓
[ArrayBuffer 변환] ❌ Chrome: 2GB 제한으로 실패
                   ✅ Firefox: 성공 but 매우 느림
    ↓
[JS Heap] 파싱된 객체 (메타데이터)
    ↓
[GPU Memory] 렌더링 데이터
```

---

## 브라우저별 차이점

### Chrome (V8 엔진)
```javascript
// 엄격한 2GB 제한
try {
    const buffer = new ArrayBuffer(2.5 * 1024 * 1024 * 1024);
} catch(e) {
    console.error("RangeError: ArrayBuffer allocation failed");
}
```

### Firefox (SpiderMonkey 엔진)
```javascript
// 8GB까지 가능하지만 성능 이슈
const buffer = new ArrayBuffer(2.5 * 1024 * 1024 * 1024); // ✅ 성공
// 하지만:
// - 메모리 할당: 10-20초
// - 파싱: 20-40초
// - 총 소요시간: 30-60초
```

### 성능 차이 원인
- **Chrome**: 즉시 연속 메모리 할당 → 실패
- **Firefox**: 가상 메모리 예약 후 지연 할당 → 느림

### 브라우저 감지 및 대응
```javascript
function detectBrowserLimits() {
    const isChrome = /Chrome/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);
    
    if (isChrome) {
        console.log('Chrome 감지: 2GB 제한');
        return { maxArrayBuffer: 2 * 1024 * 1024 * 1024 };
    } else if (isFirefox) {
        console.log('Firefox 감지: 8GB 가능 but 느림');
        return { maxArrayBuffer: 8 * 1024 * 1024 * 1024, slow: true };
    }
}
```

---

## 해결 방안

### 1. 파일 분할 (가장 현실적)
```javascript
// 서버에서 GLB를 여러 파일로 분할
async function loadSplitGLB() {
    // 각 파일을 2GB 이하로 분할
    const parts = await Promise.all([
        fetch('model-geometry.glb').then(r => r.arrayBuffer()),   // 1GB
        fetch('model-textures.glb').then(r => r.arrayBuffer()),   // 1GB
        fetch('model-animations.glb').then(r => r.arrayBuffer())  // 0.5GB
    ]);
    
    return mergeGLBParts(parts);
}

function mergeGLBParts(buffers) {
    // 각 파트를 개별적으로 파싱하고 결합
    const geometries = parseGeometry(buffers[0]);
    const textures = parseTextures(buffers[1]);
    const animations = parseAnimations(buffers[2]);
    
    return { geometries, textures, animations };
}
```

### 2. DRACO 압축 (빌드 타임에 수행)

**⚠️ 중요: DRACO 압축은 개발자가 미리 수행하는 작업입니다**

```bash
# 개발 환경에서 압축 (Node.js)
npx gltf-pipeline -i original.glb -o compressed.glb --draco.compressionLevel 10
```

```javascript
// 압축 과정 (빌드 타임)
const gltfPipeline = require('gltf-pipeline');
const fs = require('fs');

async function compressModelBeforeDeployment() {
    const glb = fs.readFileSync('original.glb'); // 2.5GB
    
    const options = {
        dracoOptions: {
            compressionLevel: 10  // 최대 압축
        }
    };
    
    // DRACO는 메시 데이터만 압축 (텍스처는 압축 안됨!)
    // 예시: 
    // - 메시: 1GB → 100MB (90% 압축)
    // - 텍스처: 1.5GB → 1.5GB (변화 없음)
    // - 결과: 2.5GB → 1.6GB
    
    const result = await gltfPipeline.processGlb(glb, options);
    fs.writeFileSync('compressed.glb', result.glb); // 1.6GB
}
```

```javascript
// 브라우저에서는 압축 해제만 수행
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/'); // WASM 디코더

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// 이미 압축된 1.6GB 파일 로드 (2GB 미만이므로 성공!)
gltfLoader.load('compressed.glb', (gltf) => {
    // DRACOLoader가 압축된 메시를 압축 해제
    scene.add(gltf.scene);
});
```

### 3. 텍스처 최적화 (별도 압축 필요)

```javascript
// 텍스처는 DRACO로 압축되지 않으므로 별도 처리 필요

// 방법 1: 텍스처를 GLB에서 분리
async function loadWithSeparateTextures() {
    // 메시만 포함된 GLB (DRACO 압축됨)
    const gltf = await gltfLoader.loadAsync('model-geometry.glb'); // 100MB
    
    // 텍스처는 KTX2 포맷으로 별도 로드
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    
    const textures = await Promise.all([
        ktx2Loader.loadAsync('diffuse.ktx2'),   // 원본 500MB → 50MB
        ktx2Loader.loadAsync('normal.ktx2'),    // 원본 400MB → 40MB
        ktx2Loader.loadAsync('metalness.ktx2')  // 원본 300MB → 30MB
    ]);
    
    // 텍스처 적용
    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            child.material.map = textures[0];
            child.material.normalMap = textures[1];
            child.material.metalnessMap = textures[2];
        }
    });
    
    return gltf;
}

// 방법 2: 텍스처 해상도 조정
// 4K (4096x4096) → 2K (2048x2048) = 75% 메모리 절감
```

### 4. LOD (Level of Detail) 시스템

```javascript
// 거리에 따라 다른 해상도 모델 로드
class LODManager {
    constructor() {
        this.levels = [
            { distance: 100, file: 'model-high.glb', size: 1024 },    // 1GB
            { distance: 500, file: 'model-medium.glb', size: 512 },   // 512MB
            { distance: 1000, file: 'model-low.glb', size: 100 }      // 100MB
        ];
    }
    
    async loadAppropriate(cameraDistance) {
        const level = this.levels.find(l => cameraDistance < l.distance);
        
        if (level && level.size < 2000) { // 2GB 미만
            return await loadGLB(level.file);
        }
        
        // 2GB 이상이면 분할 로드
        return await loadSplitGLB(level.file);
    }
}
```

### 5. 스트리밍 로드 (실험적)

```javascript
// Three.js는 현재 지원하지 않지만, 커스텀 구현 가능
class StreamingGLBLoader {
    async load(url) {
        const response = await fetch(url);
        const reader = response.body.getReader();
        
        let chunks = [];
        let totalSize = 0;
        
        while(true) {
            const {done, value} = await reader.read();
            if(done) break;
            
            chunks.push(value);
            totalSize += value.byteLength;
            
            // 100MB씩 처리
            if(totalSize > 100 * 1024 * 1024) {
                await this.processChunks(chunks);
                chunks = [];
                totalSize = 0;
            }
        }
    }
    
    async processChunks(chunks) {
        // 청크를 파싱하고 즉시 GPU로 업로드
        // ArrayBuffer 2GB 제한 우회
    }
}
```

---

## 결론 및 권고사항

### 핵심 발견
1. **문제는 "브라우저 메모리 부족"이 아닌 "ArrayBuffer 2GB 제한"**
2. Chrome/Edge는 V8 엔진의 2GB 제한으로 불가능
3. Firefox는 가능하지만 실용적이지 않음 (너무 느림)
4. GPU 메모리는 충분하지만 도달하지 못함

### 즉시 적용 가능한 해결책

#### 우선순위 1: 파일 크기 축소
```javascript
// 실무 적용 체크리스트
const optimizationChecklist = {
    // 1. 파일 크기 확인
    async checkFileSize(url) {
        const response = await fetch(url, { method: 'HEAD' });
        const size = parseInt(response.headers.get('content-length'));
        const sizeMB = (size / 1024 / 1024).toFixed(2);
        
        if (size > 2 * 1024 * 1024 * 1024) {
            console.warn(`파일 크기: ${sizeMB}MB - 최적화 필요!`);
            return false;
        }
        return true;
    },
    
    // 2. 최적화 전략 선택
    getOptimizationStrategy(fileSize) {
        const strategies = [];
        
        if (fileSize > 2 * 1024 * 1024 * 1024) {
            strategies.push('파일 분할');
        }
        
        strategies.push('DRACO 메시 압축 (빌드 타임)');
        strategies.push('텍스처 분리 및 KTX2 압축');
        strategies.push('LOD 시스템 구현');
        
        return strategies;
    }
};
```

#### 우선순위 2: 빌드 파이프라인 구축

```bash
# package.json 스크립트
{
  "scripts": {
    "optimize-models": "node scripts/optimize-glb.js",
    "compress-textures": "node scripts/compress-textures.js"
  }
}
```

```javascript
// scripts/optimize-glb.js
const gltfPipeline = require('gltf-pipeline');
const fs = require('fs');
const path = require('path');

async function optimizeAllModels() {
    const modelsDir = './models/original';
    const outputDir = './models/optimized';
    
    const files = fs.readdirSync(modelsDir);
    
    for (const file of files) {
        if (file.endsWith('.glb')) {
            const input = path.join(modelsDir, file);
            const output = path.join(outputDir, file);
            
            const glb = fs.readFileSync(input);
            const stats = fs.statSync(input);
            
            console.log(`처리중: ${file} (${(stats.size/1024/1024).toFixed(2)}MB)`);
            
            // 2GB 이상이면 경고
            if (stats.size > 2 * 1024 * 1024 * 1024) {
                console.error(`⚠️ ${file}는 2GB를 초과합니다. 분할이 필요합니다!`);
                continue;
            }
            
            // DRACO 압축 적용
            const result = await gltfPipeline.processGlb(glb, {
                dracoOptions: {
                    compressionLevel: 7
                }
            });
            
            fs.writeFileSync(output, result.glb);
            
            const newStats = fs.statSync(output);
            const reduction = ((1 - newStats.size/stats.size) * 100).toFixed(2);
            console.log(`✅ 완료: ${(newStats.size/1024/1024).toFixed(2)}MB (${reduction}% 감소)`);
        }
    }
}

optimizeAllModels();
```

### 중장기 개선 방향

1. **Three.js 커스텀 로더 개발**
   - ArrayBuffer 없이 스트리밍 파싱
   - 청크 단위 처리

2. **서버 사이드 처리**
   - 동적 LOD 생성
   - 실시간 압축/분할 API

3. **WebAssembly 활용**
   - C++ 파서를 WASM으로 컴파일
   - 4GB 메모리 제한 활용

### 실무 체크리스트

```javascript
// 프로덕션 배포 전 체크리스트
const deploymentChecklist = {
    // 1. 모든 GLB 파일 크기 검증
    validateAllModels() {
        const MAX_SIZE = 1.8 * 1024 * 1024 * 1024; // 1.8GB (안전 마진)
        // 모든 파일 검사
    },
    
    // 2. 브라우저 호환성 테스트
    testBrowserCompatibility() {
        const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
        // 각 브라우저에서 로드 테스트
    },
    
    // 3. 성능 메트릭 수집
    collectPerformanceMetrics() {
        return {
            downloadTime: 0,
            parseTime: 0,
            gpuUploadTime: 0,
            totalMemoryUsed: 0
        };
    }
};
```

---

## 참고 자료

### 공식 문서
- [Chrome Memory Limits - Text/Plain Blog](https://textslashplain.com/2020/09/15/browser-memory-limits/)
- [MDN ArrayBuffer Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer)
- [MDN WebGL Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [glTF Pipeline - 3D Tiles](https://github.com/CesiumGS/gltf-pipeline)

### 도구 및 라이브러리
- [DRACO 3D Geometry Compression](https://google.github.io/draco/)
- [KTX2/Basis Universal Texture Compression](https://github.com/KhronosGroup/KTX-Software)
- [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [gltfpack - Model Optimizer](https://github.com/zeux/meshoptimizer)

### 관련 이슈
- Chrome V8 2GB 제한: [Chromium Issue #416284](https://bugs.chromium.org/p/chromium/issues/detail?id=416284)
- Three.js 스트리밍 지원: [Three.js Issue #19897](https://github.com/mrdoob/three.js/issues/19897)

---

*문서 작성일: 2025년 1월*  
*작성자: Claude AI Assistant*  
*버전: 2.0 (수정판)*

## 부록: 빠른 테스트 코드

```javascript
// 브라우저에서 바로 테스트할 수 있는 코드
// 개발자 콘솔(F12)에 복사하여 실행

// ArrayBuffer 최대 크기 테스트
function testMaxArrayBuffer() {
    const sizes = [1, 2, 2.5, 3, 4, 8].map(gb => ({
        gb: gb,
        bytes: gb * 1024 * 1024 * 1024
    }));
    
    console.log('=== ArrayBuffer 크기 테스트 ===');
    console.log('브라우저:', navigator.userAgent.split(' ').slice(-2).join(' '));
    
    for(const {gb, bytes} of sizes) {
        try {
            const buffer = new ArrayBuffer(bytes);
            console.log(`✅ ${gb}GB: 성공`);
            // 메모리 해제
            buffer.byteLength;
        } catch(e) {
            console.log(`❌ ${gb}GB: 실패 - ${e.name}`);
            console.log(`최대 크기: 약 ${(sizes[sizes.indexOf({gb, bytes})-1]?.gb || 0)}GB`);
            break;
        }
    }
}

testMaxArrayBuffer();
```