# Atelier Nord

가상 사진 전시회 — 기본 버전과 AI 제목 버전을 함께 제공합니다.

## 공개 주소 (GitHub Pages)

| 버전 | URL |
|------|-----|
| 기본 (번호만) | https://leejy8460.github.io/Exhibition/ |
| AI 제목 | https://leejy8460.github.io/Exhibition/ai/ |

> GitHub Pages는 정적 파일만 호스팅합니다. AI 제목 생성 API는 Pages에서 직접 돌릴 수 없습니다.  
> 온라인에서 AI 제목까지 쓰려면 API 서버를 따로 배포한 뒤 `ai/config.js`의 `CAPTION_API_BASE`에 주소를 넣으세요.  
> 로컬에서는 아래 `npm start`로 페이지와 API를 함께 실행할 수 있습니다.

## 로컬 실행 (AI 제목 포함)

1. `Exhibition.env` 또는 `.env`에 키 설정:

```env
OPENAI_API_KEY=sk-proj-your-key
PORT=5173
```

2. 실행:

```bash
npm install
npm start
```

3. 접속:

- 기본: http://127.0.0.1:5173/
- AI: http://127.0.0.1:5173/ai/

## 버전 태그

- `v1-static` — AI 도입 전 안정 버전 스냅샷
- 브랜치 `openai-captions` — AI 기능 개발 이력
