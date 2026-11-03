# 파킥 챗봇 통합·실행 안내

팀원이 전달한 `parkick-chatbot-20261025-v6`를 현재 프로젝트에 병합했습니다. 기존 신고·사진 판별 코드는 유지하고, 공개 페이지에 챗봇을 추가했습니다. 추천 질문과 홈 FAQ는 브라우저에서 즉시 답하며, 그 밖의 질문은 서버의 `POST /api/chat`을 통해 LLM 게이트웨이에 보냅니다. 챗봇은 신고를 조회·접수·처리하는 도구가 아닙니다.

## 설정

현재 프로젝트는 사진 판별에 이미 `LLM_API_KEY`와 `LLM_API_BASE_URL`을 사용합니다. 팀원 전달본의 `LLM_*` 챗봇 설정을 그대로 적용하면 사진 판별 키와 충돌할 수 있어 **챗봇은 별도 `CHATBOT_*` 설정**을 사용합니다. 실제 키는 `backend/.env` 또는 운영 서버의 `/etc/parkick/backend.env`에만 입력합니다. 기존 사진 판별·DB·S3 설정은 유지하세요.

```dotenv
CHATBOT_PROVIDER=gateway
CHATBOT_BASE_URL=<제공받은 HTTPS 게이트웨이 원점 주소>
CHATBOT_API_KEY=<챗봇용 키>
CHATBOT_MODEL=bedrock-haiku
CHATBOT_TIMEOUT_MS=20000
```

`CHATBOT_BASE_URL`에는 `/v1`, 경로, 쿼리, 인증정보를 붙이지 않습니다. 허용 모델은 `bedrock-haiku`, `bedrock-sonnet`, `bedrock-gpt-5.6-luna`입니다. 별도 게이트웨이 주소와 키가 아직 없으면 `CHATBOT_PROVIDER=disabled`로 둡니다. 이때 고정 FAQ는 동작하지만 자유 질문은 일시적으로 사용할 수 없습니다. 로컬에서 외부 통신 없이 흐름을 시험하려면 `CHATBOT_PROVIDER=mock`을 사용하며 운영 환경에서는 mock을 사용할 수 없습니다. `VITE_*` 환경변수에 키를 넣지 마세요.

챗봇 경로는 게이트웨이를 경유하므로 이 기능만을 위한 EC2 Bedrock 권한은 필요하지 않습니다. 운영 EC2에는 `20261025-chatbot-1` 릴리스를 배포했습니다. `/etc/parkick/backend.env`의 기존 사진 판별용 게이트웨이 키를 서버 안에서 챗봇 설정에도 재사용하며, 프런트엔드나 소스 아카이브에는 키를 넣지 않았습니다. 실제 자유 질문의 HTTPS `POST /api/chat` 응답에서 `data.mode="gateway"`를 확인했습니다. 주소·환경파일·릴리스 전환 절차는 [배포 안내](../deploy/README.md)를 따릅니다.

## 로컬 확인

저장소 루트에서 `npm run lint --workspaces`, `npm run test --workspaces`, `npm run build --workspaces`를 실행합니다. 실제 게이트웨이 연결 전에는 외부 호출을 막은 Mock 서버로 브라우저 흐름을 검사할 수 있습니다.

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.chatbot-live.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.chatbot.config.ts
```

운영 게이트웨이를 연결한 뒤에는 공개 화면에서 “안녕”을 입력하고 브라우저 Network의 `POST /api/chat`이 HTTP 200·`data.mode="gateway"`를 반환하는지 확인합니다. 추천 질문의 즉시 답변은 게이트웨이 연결 증거가 아닙니다. 개인 전화번호·주소·키를 시험 질문으로 보내지 마세요. 상세 계약과 한계는 [챗봇 기술 안내](chatbot-llm-handoff.md)를 참고하세요.
