# Atelier Nord — OpenAI captions

## 버전 구분

| 구분 | 위치 | 설명 |
|------|------|------|
| 안정 버전 (AI 없음) | `main` 태그 `v1-static` | 번호만 표시하는 갤러리 |
| AI 제목 버전 | 브랜치 `openai-captions` | OpenAI Vision으로 한국어 제목 생성 |

안정 버전으로 돌아가기:

```bash
git checkout v1-static
```

## 중요: API 키 보안

- API 키는 **절대** GitHub에 올리지 마세요.
- 채팅/메일에 키가 노출됐다면 [OpenAI API keys](https://platform.openai.com/api-keys)에서 **즉시 폐기**하고 새로 발급하세요.
- 로컬에서는 `.env` 파일만 사용합니다 (`.gitignore`에 포함됨).

## 로컬 실행 (AI 버전)

1. `.env.example`을 복사해 `.env` 생성
2. `.env`에 새 API 키 입력:

```env
OPENAI_API_KEY=sk-proj-여기에_새_키
PORT=5173
```

3. 의존성 설치 후 서버 실행:

```bash
npm install
npm start
```

4. 브라우저에서 http://127.0.0.1:5173/ 접속

전시가 로드되거나 **전시 갱신**을 누르면 사진마다 제목을 생성합니다. 약간의 시간과 OpenAI 사용 요금이 발생합니다.
