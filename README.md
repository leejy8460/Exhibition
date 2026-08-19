# Atelier Nord

가상 사진·미술·우주 전시회

## 공개 주소 (GitHub Pages)

| 버전 | URL | 설명 |
|------|-----|------|
| 기본 v1 | https://leejy8460.github.io/Exhibition/ | Picsum 사진, 번호만 |
| AI v1 | https://leejy8460.github.io/Exhibition/ai/ | Picsum + OpenAI 제목 |
| 기본 v2 | https://leejy8460.github.io/Exhibition/v2/ | 전시 종류 선택 (사진/Met/NASA) |
| AI v2 | https://leejy8460.github.io/Exhibition/v2/ai/ | v2 + 사진전만 AI 제목 |

## v2 전시 종류 (무료 API)

| 종류 | 출처 | 표시 정보 |
|------|------|-----------|
| 사진 | Lorem Picsum | 번호 (+ AI 버전에서만 AI 제목) |
| 미술 | The Met | 작품명 · 작가 |
| 우주 | NASA | 제목 · 촬영/출처 |

AI 버전에서는 **사진전만** OpenAI로 제목을 붙이고, Met·NASA는 API 정보를 그대로 씁니다.

## AI 제목 API

Cloudflare Worker:

- API: `https://atelier-nord-captions.mixolydian-eustoma.workers.dev`
- 설정: `ai/config.js`, `v2/ai/config.js`의 `CAPTION_API_BASE`

## 로컬 실행

```bash
npm install
npm start
```

- v1 기본: http://127.0.0.1:5173/
- v1 AI: http://127.0.0.1:5173/ai/
- v2 기본: http://127.0.0.1:5173/v2/
- v2 AI: http://127.0.0.1:5173/v2/ai/

`Exhibition.env` 또는 `.env`에 `OPENAI_API_KEY` 필요 (로컬 AI 제목용).

## 버전 태그

- `v1-static` — AI 도입 전 스냅샷
- 브랜치 `openai-captions` — AI 기능 개발 이력
