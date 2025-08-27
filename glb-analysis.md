# GLB 로딩 실패 원인 분석

## 🔴 핵심 문제: ArrayBuffer 한계

### 1. **브라우저 메모리 할당 과정**
```
GLB 파일 (2.5GB) 
    ↓
FileReader.readAsArrayBuffer() → ArrayBuffer 생성 시도
    ↓
JavaScript 엔진이 연속된 메모리 공간 2.5GB 할당 시도
    ↓
❌ 실패: ArrayBuffer 최대 크기 초과
```

### 2. **ArrayBuffer 한계**
- **Chrome/Edge**: 최대 2,147,483,647 bytes (2GB - 1 byte)
  - 32-bit signed integer 한계
  - V8 엔진의 구조적 제한
- **Your file**: 2.5GB > 2GB 한계
- **결과**: `RangeError: Array buffer allocation failed`

### 3. **메모리 사용 배수 문제**
실제로 2.5GB 파일을 로드할 때 필요한 메모리:
1. 원본 파일 읽기: 2.5GB
2. ArrayBuffer 생성: 2.5GB  
3. THREE.js 파싱: +α (geometry, textures 등)
4. WebGL 버퍼: +α (GPU 메모리)
= **총 5GB+ 메모리 필요**

### 4. **코드에서 실패 지점**
```javascript
// 1. 파일 읽기 시도
const arrayBuffer = await response.arrayBuffer(); // ❌ 2.5GB는 실패

// 2. FileReader 시도
reader.readAsArrayBuffer(file); // ❌ 2.5GB는 실패

// 3. 청크 읽기 후 결합 시도  
const combined = new Uint8Array(totalLength); // ❌ 2.5GB는 실패
```

## 🟢 해결 방법

### 1. **파일 압축 (가장 효과적)**
- **Draco Compression**: 50-90% 크기 감소
- **gltf-pipeline** 사용:
```bash
npm install -g gltf-pipeline
gltf-pipeline -i model.glb -o model-draco.glb --draco.compressionLevel 10
```

### 2. **모델 최적화**
- **Decimation**: 폴리곤 수 감소
- **텍스처 압축**: KTX2/Basis 형식
- **불필요한 데이터 제거**: 애니메이션, 노말맵 등

### 3. **스트리밍 로더 (실험적)**
```javascript
// THREE.js의 실험적 기능
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 부분 로딩 - 전체 파일이 아닌 필요한 부분만
loader.setMeshOptDecoder(); // MeshOpt 압축 지원
```

### 4. **서버 사이드 처리**
- 서버에서 모델을 분할
- LOD (Level of Detail) 시스템
- 스트리밍 메시 전송

### 5. **WebAssembly 활용**
```javascript
// WASM 기반 로더 (메모리 관리 개선)
const wasmLoader = new WASMGLTFLoader();
```

## 📊 브라우저별 실제 한계

| 브라우저 | ArrayBuffer 한계 | 실제 로드 가능 GLB |
|---------|-----------------|-------------------|
| Chrome | 2GB | ~1.5GB |
| Firefox 64bit | 4GB | ~3GB |
| Safari | 1GB | ~800MB |
| Mobile | 500MB | ~300MB |

## 💡 권장사항

1. **즉시 적용 가능**: Draco 압축으로 파일 크기를 1GB 이하로 감소
2. **중기 솔루션**: 모델을 여러 파일로 분할
3. **장기 솔루션**: 스트리밍 아키텍처 구축

## 테스트 코드
```javascript
// ArrayBuffer 한계 직접 확인
try {
  const testBuffer = new ArrayBuffer(2.5 * 1024 * 1024 * 1024);
  console.log('Success');
} catch(e) {
  console.error('Failed:', e.message); 
  // 출력: "Failed: Array buffer allocation failed"
}
```