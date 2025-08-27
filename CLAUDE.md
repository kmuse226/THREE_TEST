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
├── compress-glb.js      # GLB 압축 유틸리티
├── glb-analysis.md      # GLB 로딩 문제 분석 문서
├── vite.config.js       # Vite 설정
├── package.json         # 프로젝트 의존성
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

### 3. GLB 압축 도구 (compress-glb.js)
- 메시 단순화
- 텍스처 크기 조정
- Draco 압축 적용
- 불필요한 속성 제거

## 기술 스택
- **THREE.js**: 0.160.0
- **Vite**: 5.0.0 (빌드 도구)
- **lil-gui**: 0.19.0 (GUI 컨트롤)
- **Draco Loader**: 3D 지오메트리 압축
- **KTX2 Loader**: 텍스처 압축

## 알려진 이슈 및 해결방법

### 1. 2.5GB GLB 파일 로드 실패
**문제**: `RangeError: Array buffer allocation failed`
- **원인**: Chrome의 ArrayBuffer 최대 크기는 2GB (2,147,483,647 bytes)
- **해결방법**:
  1. Draco 압축으로 파일 크기 감소 (50-90% 압축률)
  2. 모델을 여러 파일로 분할
  3. LOD 시스템 구현
  4. 서버 사이드 스트리밍 구현

### 2. 브라우저별 메모리 한계
| 브라우저 | ArrayBuffer 한계 | 실제 로드 가능 GLB |
|---------|-----------------|-------------------|
| Chrome/Edge | 2GB | ~1.5GB |
| Firefox 64bit | 4GB | ~3GB |
| Safari | 1GB | ~800MB |
| Mobile | 500MB | ~300MB |

### 3. 메모리 사용량 계산
2.5GB 파일 로드 시 필요 메모리:
- 파일 읽기: 2.5GB
- ArrayBuffer: 2.5GB
- THREE.js 파싱: +α
- WebGL 버퍼: +α
- **총합**: 5GB+ 필요

## 성능 최적화 팁

### 1. 모델 최적화
- **Decimation**: 폴리곤 수 감소
- **텍스처 압축**: KTX2/Basis 형식 사용
- **불필요한 데이터 제거**: 사용하지 않는 애니메이션, 노말맵 등

### 2. 로딩 최적화
- **청크 로딩**: 64MB 단위로 파일 읽기
- **스트리밍**: 필요한 부분만 순차 로드
- **캐싱**: THREE.Cache 활용

### 3. 렌더링 최적화
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

### 빌드
```bash
npm run build
```

### 메모리 테스트
브라우저에서 `memory-test.html` 열기

### GLB 파일 로드
1. 개발 서버 실행 후 브라우저에서 열기
2. 파일 선택 버튼으로 GLB 파일 선택
3. 또는 `model/` 폴더에 파일 배치

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