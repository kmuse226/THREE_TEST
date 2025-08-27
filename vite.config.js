import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: '/index-webgpu.html', // WebGPU 버전을 기본으로
    // 대용량 파일 처리를 위한 설정
    fs: {
      strict: false,
      allow: ['..']
    },
    cors: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 대용량 파일 처리를 위한 청크 크기 증가
    chunkSizeWarningLimit: 5000,
    assetsInlineLimit: 0
  },
  optimizeDeps: {
    include: ['three'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr']
});