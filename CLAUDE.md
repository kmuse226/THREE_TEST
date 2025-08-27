# THREE.js Large GLB Loader Project

## 프로젝트 개요
대용량 GLB 파일(2.5GB+)을 로드하고 시각화하는 THREE.js 기반 웹 애플리케이션

## 프로젝트 구조
```
THREE_TEST/
├── src/
│   └── main.js          # 메인 THREE.js 애플리케이션
├── model/               # GLB 모델 파일 위치
│   └── Ship_Room_50-99.glb  # 테스트용 대용량 GLB 파일
├── index.html           # 메인 HTML 파일
├── memory-test.html     # 브라우저 메모리 한계 테스트 도구
├── glb-analysis.md      # GLB 로딩 문제 분석 문서
├── vite.config.js       # Vite 설정
├── package.json         # 프로젝트 의존성
├── CLAUDE.md           # 프로젝트 문서
└── .gitignore          # Git ignore 설정
```

## 주요 기능

### 1. GLB 로더 (main.js)
- **대용량 파일 처리**: 청크 단위 로딩으로 메모리 최적화
- **WebGPU 지원 감지**: 브라우저의 WebGPU API 가용성 확인
- **성능 모니터링**: 
  - FPS 실시간 추적
  - 메모리 사용량 표시
  - 삼각형 수 카운트
  - 파일 크기 정보
- **최적화 기능**:
  - Draco 압축 지원
  - KTX2 텍스처 지원
  - Frustum Culling
  - LOD 시스템 준비
- **GUI 컨트롤**: 
  - 와이어프레임 토글
  - 그림자 on/off
  - 픽셀 비율 조정
  - LOD Bias 설정

### 2. 메모리 테스트 도구 (memory-test.html)
- **시스템 정보**: 브라우저 및 하드웨어 정보 표시
- **ArrayBuffer 한계 테스트**: 최대 할당 가능한 ArrayBuffer 크기 측정
- **WebGL 한계 테스트**: 텍스처 크기 및 렌더링 한계 확인
- **메모리 스트레스 테스트**: 점진적 메모리 할당으로 실제 한계 측정
- **File API 테스트**: 파일 읽기 성능 및 한계 확인

### 3. GLB 압축 가이드
브라우저에서는 2.5GB 파일을 압축할 수 없으므로, 오프라인 도구를 사용해야 합니다:

#### gltf-pipeline (권장)
```bash
# 설치
npm install -g gltf-pipeline

# Draco 압축 적용
gltf-pipeline -i model.glb -o model-compressed.glb --draco.compressionLevel 10
```

#### gltfpack
```bash
# 설치
npm install -g gltfpack

# Meshopt 압축 적용
gltfpack -i model.glb -o model-optimized.glb -cc -tc
```

#### Blender
1. GLB 파일 import
2. Decimate Modifier로 폴리곤 감소
3. Export GLB with Draco compression enabled

## 기술 스택
- **THREE.js**: 0.160.0
- **Vite**: 5.0.0 (빌드 도구)
- **lil-gui**: 0.19.0 (GUI 컨트롤)
- **Draco Loader**: 3D 지오메트리 압축
- **KTX2 Loader**: 텍스처 압축

## 현재 기술 한계 및 브라우저 지원 현황

### 📊 브라우저별 WebGPU/WebGL 지원 현황

| 브라우저 | WebGL | WebGPU | ArrayBuffer 한계 | 2.5GB GLB 로드 |
|---------|--------|---------|-----------------|----------------|
| **Chrome/Edge (안정 버전)** | ✅ 완전 지원 | ⚠️ 플래그 필요 | 2GB | ❌ 불가능 |
| **Chrome Canary** | ✅ 완전 지원 | ✅ 기본 활성화 | 2GB | ❌ 불가능 |
| **Firefox (안정 버전)** | ✅ 완전 지원 | ❌ 미지원 | 4GB | ⚠️ 이론적 가능, 매우 느림 |
| **Firefox Nightly** | ✅ 완전 지원 | ⚠️ 플래그 필요 | 4GB | ⚠️ WebGL로만 가능, 느림 |
| **Safari** | ✅ 완전 지원 | ⚠️ 실험적 | 1GB | ❌ 불가능 |

### 🔴 핵심 문제: JavaScript ArrayBuffer 한계

**WebGPU도 ArrayBuffer 한계를 벗어날 수 없음**
- WebGPU는 GPU 메모리를 효율적으로 관리하지만
- JavaScript에서 파일을 읽는 단계에서 ArrayBuffer 생성 필요
- 2.5GB 파일은 읽기 단계에서 실패 (Chrome: 2GB 한계)

```javascript
// 실패 지점
const arrayBuffer = await file.arrayBuffer(); // ❌ 2.5GB는 2GB 한계 초과
```

### WebGPU 활성화 방법

#### Chrome/Edge
1. 주소창에 `chrome://flags` 또는 `edge://flags` 입력
2. "Unsafe WebGPU" 검색
3. "Enabled" 선택
4. 브라우저 재시작

#### Firefox Nightly
1. 주소창에 `about:config` 입력
2. 다음 설정을 `true`로 변경:
   - `dom.webgpu.enabled`
   - `gfx.webgpu.force-enabled`
3. 브라우저 재시작

### 알려진 이슈 및 해결방법

#### 1. 2.5GB GLB 파일 로드 실패
**문제**: `RangeError: Array buffer allocation failed`
- **원인**: 브라우저 ArrayBuffer 크기 제한
- **Chrome/Edge**: 최대 2,147,483,647 bytes (2GB - 1 byte)
- **Firefox**: 최대 4GB (64bit 버전)
- **Safari**: 최대 1GB

#### 2. WebGPU 디바이스 생성 실패
**문제**: `Required limit is greater than the supported limit`
- **원인**: GPU가 요청한 버퍼 크기를 지원하지 않음
- **해결**: 어댑터의 실제 한계를 확인 후 그 이하로 요청

#### 3. 메모리 사용량 계산
2.5GB 파일 로드 시 필요 메모리:
- 파일 읽기: 2.5GB
- ArrayBuffer: 2.5GB  
- THREE.js 파싱: +α
- WebGL/WebGPU 버퍼: +α
- **총합**: 5GB+ 필요

## ✅ 실용적인 해결책

### 1. **파일 압축 (가장 현실적)**
Draco 또는 gltfpack으로 50-90% 압축:
```bash
# gltf-pipeline (Draco 압축)
gltf-pipeline -i model.glb -o model-compressed.glb --draco.compressionLevel 10

# gltfpack (Meshopt 압축)
gltfpack -i model.glb -o model-optimized.glb -cc -tc
```
**결과**: 2.5GB → 500MB~1.2GB로 감소

### 2. **파일 분할**
- 모델을 여러 파트로 나누기 (예: 건물 층별, 부품별)
- 각 파트를 순차적으로 로드
- 뷰포트에 보이는 부분만 우선 로드

### 3. **서버 스트리밍 (고급)**
- 서버에서 청크 단위로 전송
- 클라이언트에서 점진적 렌더링
- Range 요청으로 필요한 부분만 로드

## 🎯 결론

**현재 브라우저 기술로는 2.5GB GLB 파일 직접 로드 불가능**

- ✅ **압축이 가장 현실적인 해결책** (Draco/gltfpack)
- ⚠️ WebGPU는 아직 실험적 단계 (2024년 기준)
- ⚠️ WebGPU도 JavaScript ArrayBuffer 2GB 한계 존재
- 💡 대용량 3D는 여전히 네이티브 애플리케이션이 유리

## 성능 최적화 팁

### 모델 최적화
- **Decimation**: 폴리곤 수 감소
- **텍스처 압축**: KTX2/Basis 형식 사용
- **불필요한 데이터 제거**: 사용하지 않는 애니메이션, 노말맵 등

### 로딩 최적화
- **청크 로딩**: 64MB 단위로 파일 읽기
- **스트리밍**: 필요한 부분만 순차 로드
- **캐싱**: THREE.Cache 활용

### 렌더링 최적화
- **Frustum Culling**: 화면 밖 오브젝트 제외
- **LOD**: 거리별 다른 해상도 모델
- **인스턴싱**: 반복되는 지오메트리 최적화

## 사용 방법

### 개발 서버 실행
```bash
cd Personal/THREE_TEST
npm install
npm run dev
```

### 사용 가능한 페이지들
- `/index.html` - WebGL 버전 (기본)
- `/index-webgpu.html` - WebGPU 버전 (실험적)
- `/memory-test.html` - 브라우저 메모리 한계 테스트
- `/firefox-gpu-test.html` - Firefox WebGPU 지원 테스트

### 빌드
```bash
npm run build
```

### GLB 파일 로드
1. 개발 서버 실행 후 브라우저에서 열기
2. 파일 선택 버튼으로 GLB 파일 선택 (2GB 미만 권장)
3. 대용량 파일은 먼저 압축 후 사용

## 추가 개발 계획
- [ ] WebGPU 렌더러 통합
- [ ] 프로그레시브 로딩 구현
- [ ] 스트리밍 메시 지원
- [ ] 서버 사이드 처리 추가
- [ ] WASM 기반 로더 구현

## 참고 자료
- [THREE.js Documentation](https://threejs.org/docs/)
- [Draco 3D Compression](https://google.github.io/draco/)
- [KTX2 Texture Format](https://www.khronos.org/ktx/)
- [WebGPU API](https://gpuweb.github.io/gpuweb/)

## 문제 해결 체크리스트
- [ ] 파일 크기가 2GB 미만인지 확인
- [ ] 브라우저 콘솔에서 메모리 에러 확인
- [ ] `memory-test.html`로 브라우저 한계 테스트
- [ ] Draco 압축 적용 고려
- [ ] 모델 분할 검토

## 개발 환경
- Windows 11
- Node.js 필요
- 최신 Chrome/Edge 권장
- GPU 가속 활성화 필요

---
*Last Updated: 2025-08-27*