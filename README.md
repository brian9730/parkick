# Parkick · 파킥

공유 PM(Personal Mobility, 전동킥보드 등)의 무단·불편 주차를 시민이 간편하게 신고하고, 관리자가 신고 현황과 처리 상태를 관리하는 웹 플랫폼입니다. Parkick은 **Parking + Kickboard**를 뜻합니다.

학부 캡스톤·졸업작품과 향후 학술대회 연구를 위한 프로젝트입니다. **Phase 5 전화번호 기반 신고 조회**와 느린 사진 전송을 위한 **5분 제출 대기·실제 업로드 진행률**을 EC2에 반영했습니다. 운영 주소는 **[https://15.165.235.154](https://15.165.235.154)**입니다. 2026-10-22에 업체·기기번호 필수 입력과 신고문 작성 단계를 뺀 **5단계 신고** 소스를 EC2에 배포했습니다. 2026-10-23에는 기존 EC2 인스턴스 프로필을 연결하고 신고 사진 저장을 비공개 S3로 전환해 기존 사진 6장을 이전·검증했습니다. 이어 `20261023-litellm-photo-1`을 배포해 현장 사진의 LiteLLM 내용 판별을 활성화했습니다. 외부 HTTPS 사전 검사에서 공유 킥보드 사진은 통과하고 무관 JPEG는 거부됐습니다. S3 역할 연결은 EC2의 직접 Bedrock 이미지 호출 검증을 뜻하지 않습니다. 실제 휴대전화·새 AI 모드의 최종 신고 제출·운영 브라우저 사진 조회는 아직 검증하지 않았습니다. 웹·API·PostgreSQL은 EC2, 사진은 S3에서 운영합니다. 실제 지자체로 전송하지 않고 개발 관리자 인증은 비활성화했습니다. **Phase 6의 DB 관리자 계정·영속 세션 로그인과 관리자 실데이터 조회·서버 권한 격리·처리중 전환·수거/견인 완료·메모는 이전 EC2 릴리스에서 검증했습니다.** 관리자 지도도 배포·실제 NAVER SDK 검증을 완료했으며, 테넌트 계정 생성 UI·통계는 남아 있습니다.

2026-10-16 관리자 신고 관리 수정본 검증: Backend 단위/API 91개·실제 PostgreSQL 통합 20개, Frontend lint·운영 빌드, 새 관리자 브라우저 2개·기존 회귀 3개를 통과했습니다. 2026-10-16 00:37:35.877 KST(2026-10-15T15:37:35.877Z) 실제 HTTPS 검증에서 DB 대시보드·검색·비공개 사진, 처리중→수거 완료·직접 견인 완료, 동일 요청 재시도 시 이력 중복 없음, 완료 내용 변경 409, 시민 조회의 공개 메모만 반환, 모바일 가로 넘침 없음을 확인했습니다. 검증용 신고 정확히 2건과 해당 사진만 정리했고 기존 DB·사진·관리자 설정·연락처 키를 보존했습니다. 이번 배포에서는 DB Migration을 실행하지 않았습니다.

## 현재 구현 범위

| 구분 | 내용 |
| --- | --- |
| IMPLEMENTED | npm workspace, React·TypeScript·Vite 프론트엔드, Express·TypeScript 백엔드, 기본 라우팅, 브랜드 토큰, 공식 로고 적용, 공통 UI, 환경설정·lint·build 구성 |
| IMPLEMENTED | Public Home, 관리자 로그인 화면, 인증된 관리자 화면 접근 구조, 신고 Wizard와 전화번호 조회·상세 화면 |
| IMPLEMENTED | Prisma PostgreSQL Schema·초기 Migration·개발 seed, 테넌트·지역 소유권과 DB 제약 |
| 배포 / 운영 흐름 검증 대기 | 카메라·사진 QR 디코딩과 해석 API, 업체·기기번호 필수 확인과 수동 입력 변경을 EC2에 배포 |
| 배포 / 운영 흐름 검증 대기 | 현장사진 촬영·선택·교체·삭제·미리보기와 형식 검증을 EC2에 배포; `bedrock` 모드의 관련성 판별은 미활성화 |
| IMPLEMENTED | 위치 단계 진입 시 GPS 자동 확인·NAVER 주소 조회, 지도 핀·주소 수정·위치 재확인, GPS/지도 오류 시 좌표 직접 입력, 사용자 확인과 단계별 필수값 검증 |
| 배포 / 운영 흐름 검증 대기 | 5단계 신고: QR 확인 → 현장 사진 → 위치 확인 → 신고 유형 → 연락처(선택); 신고문 작성 단계 제거, 서버가 선택 유형을 보관용 요약으로 생성하고 선택적 설명은 별도 저장 |
| 구현 / 운영 사전 검사 완료 | 내부 LiteLLM 프록시 사진 판별: 외부 HTTPS에서 공유 킥보드 사진 허용·무관 JPEG 거부 확인, 최종 신고 제출은 미검증. 직접 Bedrock 호출은 별도 대안 |
| EC2 배포 / 기본 동작 검증 | 촬영 중 공유 PM의 크기·중앙 배치·전체 노출을 주기적으로 AI에 확인하는 안내 화면. 현재 운영은 LiteLLM 경유 Bedrock을 사용하며 최종 사진 검사는 별도로 유지. 외부 HTTPS의 합성 사진 API 응답과 가상 카메라 모바일 화면 확인 완료; 실제 휴대전화·현장 사진에서 안내 품질은 추가 확인 필요 |
| EC2 운영 중 | 공개 페이지 안내 챗봇: 고정 FAQ는 브라우저에서 즉시 답하고 자유 질문은 서버의 `/api/chat`에서 HTTPS 게이트웨이로 처리. 운영 키는 서버 환경파일에만 보관; [통합 안내](docs/chatbot-quickstart.md) |
| 구현 / 실제 사이트 확인 | NAVER 지도·핀 이동·도로명 우선 주소 조회·실패 시 재조회·수동 입력 보호 구현 및 배포; 2026-10-18 실제 HTTPS 브라우저에서 자동 주소 조회 성공 |
| MOCK / 개발 전용 | 환경변수로 명시적으로 활성화하는 메모리 기반 관리자 계정·세션; 실제 DB 신고 관리 권한과 구분 |
| IMPLEMENTED | DB 관리자 계정·영속 세션 로그인, 플랫폼 관리자 최초 등록 CLI; EC2 실제 로그인·세션 복원·로그아웃 검증 통과 |
| 구현 / EC2 검증 완료 | 실제 DB 대시보드 집계·최근 신고, 목록·필터·검색·페이지 이동, 상세·비공개 사진, 처리중·수거/견인 완료·공개/내부 메모, 서버의 플랫폼 전체·테넌트 소속 범위 접근 통제; 로컬 검증 완료 |
| MOCK / 개발 전용 | 사진 판별 호출 생략과 기존 신고문 템플릿; 실제 AI 호출·토큰 사용 없음, 운영 환경에서는 금지 |
| IMPLEMENTED | Multipart 최종 제출, 서버 사진 검증·EXIF 정제·비공개 S3 저장(개발 PC는 로컬 선택 가능), PostgreSQL 저장·접수번호·완료 화면·중복 제출 방지 |
| IMPLEMENTED | XHR 기반 실측 업로드 진행률·5분 제출 대기, 전송 완료와 서버 접수 확인 구분, 같은 내용의 재시도 UUID 유지 |
| IMPLEMENTED | 전화번호만으로 신고 목록·상세·처리 이력 조회, 20건 페이지 이동·IP 공유 요청 제한·공개 필드 제한·메모리 전용 조회 상태 |
| 구현 / 운영 배포 | EC2 웹·API·PostgreSQL·IP HTTPS와 비공개 S3 사진 저장; 외부 API 접수·재시도, 모바일 Chrome 초기 흐름·인증서 갱신 검사는 초기 릴리스에서 통과 |
| 구현 / S3 전환 완료 | 비공개 S3 사진 업로드·실패 시 정리·내부 조회 URL 생성, `local`/`s3` 환경설정, `aws:check`; EC2 역할 S3 임시 객체 검사와 기존 사진 6장 이전·조회 검증 통과 |
| IMPLEMENTED / PARTIAL | 카카오·빔·지쿠·스윙·알파카·쏘카 일레클의 확인된 QR 형식 Parser; 다른 형식은 추가 확인 필요 |
| TODO | 테넌트 계정 생성 UI·실제 담당 지역 등록, 관리자 통계, LiteLLM 활성 상태에서 최종 신고 제출·브라우저 사진 조회, 실제 모바일 기기·백업 복구 검증 |

`MOCK` 또는 준비 중 안내는 실제 처리 결과를 뜻하지 않습니다. 현재 EC2 관리자 화면은 실제 DB 집계·신고 목록·상세·처리에 연결되어 있습니다. 대시보드와 전용 관리자 지도는 배포·실제 NAVER SDK 검증을 완료했으며, 통계는 미구현입니다. 신고 화면의 GPS·사진 입력과 QR 디코딩은 실제 브라우저 기능을 사용합니다.

신고 화면에서 QR을 읽으면 원문을 해석 API에 전달합니다. QR 해석 API는 원문을 저장하거나 로그에 남기지 않으며, 최종 제출할 때 신고 정보와 함께 DB에 저장합니다. 실물 사진으로 확인한 카카오 T 바이크·빔·지쿠·스윙·알파카·쏘카 일레클의 일부 형식은 업체와 기기번호를 자동 입력합니다. 지쿠의 이전 10자리 토큰은 업체만 판별하고, 숫자 5자리 QR은 사용자가 빔을 선택한 경우에만 번호를 입력합니다. **QR이 업체나 번호를 채우지 못하면 업체를 선택하고 기기번호를 직접 입력해야 다음 단계로 갑니다.** [업체별 지원 범위와 근거](deploy/qr-operator-support.md)를 참고합니다. 위치 단계에 들어가면 브라우저에서 기기 GPS를 자동 요청하고, 확인된 좌표를 네이버 역지오코딩으로 주소 조회합니다. 제출 전 초안과 사진은 화면 메모리에 보관하며 단계 이동 시 유지되고, 새로고침하거나 신고 화면을 나가면 사라집니다. 제출에 성공한 신고·사진은 서버에 남고, 완료 화면 새로고침을 위해 접수번호·시각·위치·상태·연락처 유무만 `sessionStorage`에 보관합니다. 전화번호·사진·신고 요약 전체는 브라우저 저장소에 남기지 않습니다.

지도 키를 설정한 경우에만 좌표가 NAVER의 지도·주소 조회에 사용됩니다. 현장 사진은 서버에서 방향 보정·메타데이터 제거·축소한 뒤 운영 `litellm` 경로의 HTTPS 프록시로 보냅니다. `bedrock` 직접 호출 대안은 AWS의 `us-east-1` Converse 모델을 사용하며, US 추론 프로필은 미국 내 `us-east-1`·`us-east-2`·`us-west-2`로 요청을 라우팅할 수 있습니다. 제출 후 정제한 사진은 비공개 S3에 보관하며, 전화번호·QR 원문·좌표는 사진 판별 요청에 포함하지 않습니다. EC2 역할의 직접 Bedrock 권한은 이 프록시 경로에 사용하지 않습니다.

## 신고 화면 사용법

1. `/report`에서 카메라로 QR을 비추거나 QR 사진을 선택합니다. QR이 업체와 번호를 자동 입력하면 확인하고, 인식되지 않으면 업체를 선택하고 기기에 표시된 번호를 직접 입력합니다. 목록에 없는 업체는 기타 업체명을 입력합니다. **업체와 기기번호가 모두 있어야 진행할 수 있습니다.** QR 단계의 별도 확인 체크박스는 없습니다.
2. 현장사진을 **1~2장**, 원본 장당 **10MiB(10×1024×1024바이트) 이하**로 첨부합니다. AI가 설정된 환경의 **실시간 안내 촬영**에서는 최대 8회, 약 4초 간격으로 축소한 카메라 프레임을 서버에 보내 기기가 너무 작게 보이는지, 중앙에 있는지, 전체가 보이는지 안내합니다. '작게 보임'은 기기의 긴 방향이 화면의 약 1/3에도 못 미치는 경우를 모델에 판단하게 한 촬영 가이드이며 실제 거리 측정값은 아닙니다. 프레임은 신고 사진으로 저장하지 않으며 촬영을 끝내면 카메라와 요청을 종료합니다. 카메라·AI 안내를 사용할 수 없다면 기본 카메라나 갤러리로 첨부할 수 있습니다. JPEG·PNG·WebP를 지원하며 브라우저에서 방향을 반영하고 긴 변을 최대 **2,560px**, JPEG 품질 **0.85**로 줄입니다. **사진 확인 후 다음 단계**를 누르면 서버가 사진 형식·크기를 검사하고 현재 운영의 LiteLLM 프록시로 정제한 사진을 보내 공유 킥보드·자전거 관련성을 확인합니다. 촬영 중 안내는 이 최종 검사 결과를 대신하지 않습니다. 관련 없는 사진이나 판별할 수 없는 사진만 있으면 재첨부해야 하며, 모델 호출 실패·시간 초과 시에도 입력과 사진을 유지하고 재시도를 안내합니다. 제출할 때 서버가 다시 검사한 뒤 EXIF를 제거한 JPEG를 비공개 저장소에 보관합니다. QR 해독용 사진에는 이 검사를 적용하지 않습니다.
3. 위치 단계에 들어가면 기기 GPS로 현재 위치를 자동 확인하고 주소를 조회합니다. 지도 핀을 실제 신고 위치로 옮기거나 **현재 위치 다시 확인**을 누를 수 있습니다. 평상시 좌표·정확도 카드와 수동 위도·경도 입력은 표시하지 않으며, GPS 또는 지도 연결·표시가 실패할 때만 직접 좌표 입력을 제공합니다. 주소 조회 실패 시 좌표를 유지하고 **주소 다시 조회**를 누르거나 위치 설명을 직접 입력합니다. 위치 또는 주소 변경 후 확인란을 다시 체크해야 합니다. 성공한 주소와 좌표가 그대로인 경우 이전·다음 단계로 이동해 돌아와도 중복 조회 없이 확인 상태를 유지합니다.
4. 신고 유형을 하나 이상 선택합니다. 기타 설명은 필요한 경우에만 입력합니다.
5. 전화번호는 선택 입력이며 신고할 때 인증하지 않습니다. 입력한다면 `010`으로 시작하는 11자리 번호와 수집·이용 동의가 필요합니다. **신고 제출**을 누르면 서버가 사진을 다시 확인하고 유형·기타 설명에서 보관용 신고 요약을 만든 뒤 접수합니다. 실제 업로드 진행률과 접수 확인 상태를 표시하며 성공 시 접수번호·시각·위치·상태를 보여줍니다. 번호를 남겼다면 완료 화면의 **처리결과 조회**에서 해당 번호로 신고 목록·진행 상태를 확인합니다. DB·사진 검증이 준비되지 않으면 접수하지 않고 입력을 유지합니다.

QR 카메라는 사용자 버튼 클릭 후 시작하며 디코딩 성공·중지·화면 이탈 때 스트림을 정리합니다. 카메라·GPS는 브라우저 권한과 보안 컨텍스트가 필요합니다. 로컬 개발은 `http://localhost:5173`을 사용하고, 스마트폰에서 다른 기기의 일반 HTTP 주소로 접속할 때는 HTTPS 구성이 필요합니다. 모바일 사진 촬영은 `capture="environment"` 힌트를 사용하므로 실제 선택 화면은 브라우저·기기마다 다를 수 있습니다. 권한 거부·장치 없음·실패 시 수동 입력 또는 파일 선택을 이용할 수 있습니다.

## 빠른 실행

Node.js **22.18 이상**과 npm이 필요합니다. 아래 명령은 PowerShell에서 실행합니다.

```powershell
Set-Location E:\parkick
npm.cmd install
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

이미 `.env`를 만들어 사용하고 있다면 복사 명령으로 덮어쓰지 말고 새 환경변수만 반영합니다.

`npm.cmd install` 후 Prisma Client를 자동 생성합니다. 설치 스크립트를 생략했다면 `npm.cmd run db:generate --workspace backend`를 한 번 실행합니다.

실제 로컬 신고 접수까지 사용하려면 PostgreSQL 실행 파일을 설치한 환경에서 아래 명령을 한 번 실행합니다. 현재 작업 PC에서는 PostgreSQL 18.1로 확인했습니다. **현재 설정인 `REPORT_STORAGE_PROVIDER=local`의 신고 접수에는 Docker·AWS 로그인·S3·Secrets Manager·Parameter Store 설정이 필요하지 않습니다.**

```powershell
npm.cmd run setup:local
```

이 명령은 프로젝트 전용 PostgreSQL을 `127.0.0.1:55432`에서 시작하고 Migration·개발 seed를 적용합니다. 기존 PostgreSQL 서비스는 변경하지 않습니다. `backend/.env`의 빈 `DATABASE_URL`과 연락처 암호화·검색 키 두 개만 채우며 기존 관리자·AWS 설정은 유지합니다. 두 키는 서로 다른 무작위 32바이트를 base64로 인코딩해 생성하며 이미 설정된 값은 덮어쓰지 않습니다. 비밀정보란 DB 비밀번호나 암호화 키처럼 서버에만 두는 값이며, 지금은 `.env`에서 관리합니다.

다음 실행부터는 `npm.cmd run db:start` 후 아래 두 개발 서버를 실행합니다. `npm.cmd run db:stop`은 프로젝트 DB만 중지하며 데이터는 유지합니다. PostgreSQL 설치 경로를 찾지 못하면 `PARKICK_PG_BIN`에 해당 `bin` 폴더를 지정합니다. 자동 설정은 프로젝트 전용 DB만 허용하며 기존 `DATABASE_URL`이 다른 DB를 가리키면 중단합니다.

개발 DB는 로컬 trust 인증을 사용하고 외부 인터페이스에 열지 않습니다. 데이터는 `backend/data/postgres`, 현재 개발 PC의 `local` 모드 사진은 `backend/data/reports`에 남으며 둘 다 버전 관리에서 제외됩니다. 개발 데이터와 전화번호 키를 유지하려면 기존 데이터 폴더와 `.env`를 함께 보존합니다. EC2에서는 별도 비밀번호 DB와 S3 저장을 사용하며, 소스 경로 밖의 `/var/lib/parkick/reports`에는 이전 사진 원본을 보존합니다.

| 파일 | 역할 | 실행 시 자동 로드 |
| --- | --- | --- |
| `backend/.env` | 로컬 서버·관리자 계정·서버 전용 설정 | Backend의 `dotenv/config`가 로드 |
| `frontend/.env` | 로컬 API 프록시·공개 지도 Client ID | Vite가 로드 |
| 각 앱의 `.env.example` | 필요한 환경변수 목록과 복사용 기본값 | 자동 로드하지 않음 |
| 루트 `.env.example` | 앱별 설정 위치 안내 | 자동 로드하지 않음 |

`.env`는 `.gitignore`에 포함되어 있고, `.env.example`은 버전 관리할 양식입니다. 앞으로 실제 비밀번호·키는 각 앱의 `.env`에서 관리하고 예제에는 실제 자격증명을 추가하지 않습니다. 서버 실행 환경에 이미 설정된 환경변수가 있으면 해당 값이 우선합니다. `.env.example`을 변경해도 이미 만든 `.env`에 자동 복사되지 않으며, `.env` 수정 후 실행 중인 서버를 재시작합니다.

2026-10-09에는 두 앱 모두 `.env`가 없어 각 앱의 예제에서 생성했습니다. 기존 관리자 설정값을 `backend/.env`에 복사했으며 런타임 설정 검증을 통과했습니다. 이후 Backend 예제의 이메일·비밀번호는 비우고 기본 인증을 비활성화하여 공유용 양식으로 정리했습니다. 2026-10-16에는 `frontend/.env`의 네이버 지도 Client ID 설정을 확인하고 운영 Frontend에 반영했습니다.

첫 번째 터미널에서 Backend를 실행합니다.

```powershell
Set-Location E:\parkick
npm.cmd run dev:backend
```

두 번째 터미널에서 Frontend를 실행합니다.

```powershell
Set-Location E:\parkick
npm.cmd run dev:frontend
```

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:4000`
- 브라우저의 `/api` 요청은 Vite 개발 서버가 Backend로 프록시합니다.
- 개발 환경에서 `localhost`와 `127.0.0.1`은 `FRONTEND_ORIGIN`의 동일한 프로토콜·포트에 한해 모두 허용합니다. 다른 포트·도메인으로 접속하면 `FRONTEND_ORIGIN`도 맞춰야 합니다. 운영·테스트 환경은 설정한 Origin만 허용합니다.
- QR·사진 준비·GPS·수동 입력과 개발 Mock 사진 판별에는 AWS 자격증명이 필요하지 않습니다. 실제 신고 접수에는 PostgreSQL이 필요합니다. LiteLLM 프록시 판별에는 서버 전용 API 키가, 직접 Bedrock 판별에는 EC2 역할의 모델 호출 권한이 필요합니다. 현재 S3 사진 저장에는 별도로 연결된 EC2 역할을 사용합니다. 지도 표시·주소 자동 조회는 별도 NAVER Maps Client ID가 필요합니다.

### 현장 사진 판별 모드

2026-10-23에 내부 LiteLLM 프록시 `https://52.78.77.90`의 유효한 HTTPS 인증서와 LiteLLM 1.102.0 API 문서를 확인했습니다. 인증된 `/v1/models`는 `bedrock-haiku`, `bedrock-sonnet`, `bedrock-gpt-5.6-luna`를 제공하고, 합성 사과 JPEG를 `bedrock-haiku`의 `/v1/chat/completions`에 보낸 시험 요청은 HTTP 200과 무관 사진이라는 JSON 판정을 반환했습니다. 응답이 JSON 코드 블록 뒤에 설명 문장을 붙인 사례를 처리하도록 백엔드를 보완했습니다. 현재 운영은 `AI_PROVIDER=litellm`이며 외부 HTTPS 사전 검사에서 공유 킥보드 사진 200·`valid=true`, 무관 JPEG 422·`PHOTO_NOT_PM`을 확인했습니다. 최종 신고 제출은 시험하지 않았습니다.

`GET /api/health`의 `services.photoValidation=litellm`이 현재 사진 판별 상태입니다. 같은 응답의 `services.ai=disabled`는 5단계 신고 화면에서 사용하지 않는 이전 텍스트 신고문 생성기 상태입니다.

`backend/.env`에 `AI_PROVIDER`를 지정하고 Backend를 재시작합니다. 설정하지 않으면 개발·테스트는 `mock`, 운영은 `disabled`를 사용합니다. 기존 `.env`를 예제로 덮어쓸 필요는 없습니다.

```dotenv
# 외부 모델 호출 없는 개발용 사진 검사 대역
AI_PROVIDER=mock
```

| 값 | 동작 |
| --- | --- |
| `mock` | 개발·테스트 전용으로 모델 호출 생략; 운영 환경에서 거부 |
| `litellm` | 서버에서 HTTPS LiteLLM 프록시의 이미지 지원 모델을 호출해 사진 관련성 판별; 프록시 API 키 필요 |
| `bedrock` | 현장 사진을 이미지 지원 Converse 모델에 보내 관련성 판별; 자격증명·모델 접근 권한 필요 |
| `disabled` | 사진 형식·크기를 검사하고 신고 접수는 허용; 이미지 내용의 관련성은 판별하지 않음 |

내부 프록시를 사용할 때는 백엔드 전용 환경변수 `AI_PROVIDER=litellm`, `LLM_API_BASE_URL=https://52.78.77.90`, `LLM_REPORT_MODEL_ID=bedrock-haiku`, `LLM_API_KEY`를 설정합니다. 키 값은 소스·문서·브라우저의 `VITE_*` 변수에 넣지 않고 운영에서는 접근 제한된 `/etc/parkick/backend.env`에만 보관합니다. 프록시를 통하면 EC2 역할에 직접 Bedrock 모델 호출 권한을 추가할 필요가 없습니다. 현재 EC2 역할의 S3 사진 저장 권한과 `AWS_REGION=ap-northeast-2`는 그대로 사용합니다. 서버 적용 전에는 합성 무관 사진과 개인정보 없는 PM 사진의 판정, 사전 확인·최종 제출 흐름을 별도로 검증해야 합니다. [운영 설정 안내](deploy/iam-admin-setup.md)

직접 Bedrock을 사용하려면 이미지 입력을 지원하는 모델과 실행 환경의 자격증명을 확인합니다. `BEDROCK_REGION`은 AI 전용 리전이며 비워 두면 `AWS_REGION`을 사용합니다. S3 서울 리전과 Bedrock 버지니아 리전을 분리할 수 있습니다. 아래는 **직접 호출을 별도로 선택하고 권한을 확인한 뒤 적용할 설정 예시**입니다. 현재 운영 EC2에는 S3용 역할이 연결됐지만 이 Bedrock 설정은 적용하지 않았습니다.

```dotenv
AI_PROVIDER=bedrock
AWS_REGION=ap-northeast-2
BEDROCK_REGION=us-east-1
BEDROCK_REPORT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

자격증명은 서버의 [AWS SDK 기본 자격증명 체인](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)을 사용합니다. 로컬에서는 설정된 AWS 프로파일·환경변수 등을, 운영에서는 IAM Role을 사용할 수 있습니다. 코드나 `VITE_*`에 자격증명을 넣지 않습니다. [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)는 해당 모델에 대한 `bedrock:InvokeModel` 권한이 필요합니다. 이 프로젝트는 프롬프트 관리 ARN 대신 시스템 프롬프트를 직접 보내는 모델·추론 프로파일 호출을 사용합니다.

사진 모델 연결 검사는 프로젝트 루트에서 실행합니다. `backend/.env`에 `BEDROCK_REGION`, `BEDROCK_REPORT_MODEL_ID`와 실제 로그인 가능한 AWS 프로파일을 설정합니다. 스크립트는 합성 사과 JPEG 한 장을 보내며 `PHOTO_NOT_PM` 판정이 나와야 성공합니다. 실제 신고 사진은 읽지 않습니다.

```bash
npm run aws:check:photo --workspace backend
```

이 검사는 무관한 시험 이미지의 거부 동작만 확인합니다. 실제 킥보드·자전거 사진의 허용 품질과 최종 신고 제출은 별도로 검증해야 합니다. AWS 모델 호출 요금이 소량 발생할 수 있습니다.

이전 텍스트 연결 검사 CLI도 아래처럼 실행할 수 있습니다.

```bash
node --import tsx backend/scripts/check-bedrock.ts
```

검사 CLI는 텍스트 전용 합성 문구만 전송하며 실제 신고·사진·연락처를 읽지 않습니다. Amazon 기본 모델 ID만 허용하므로 **위 Claude US 추론 프로필의 이미지 호출 검증으로 사용할 수 없습니다.** 예전 예시의 Nova Micro도 [텍스트 전용 모델](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-micro.html)이어서 사진 판별용으로 사용할 수 없습니다. 운영 전에는 EC2 실행 역할과 같은 환경에서 이미지 지원 모델의 실제 사진 판별 호출을 별도로 검증해야 합니다.

**2026-10-22 재확인:** 운영 EC2의 IMDSv2 `iam/info`는 404였고, 실행 중인 API 서비스에 AWS 자격증명 환경변수나 서비스 계정의 `.aws` 파일이 없었습니다. `AI_PROVIDER=disabled`도 확인했습니다. 기존 `SafeInstanceProfile-sgu-202686`은 EC2에 연결되지 않았습니다. 로컬 `parkick` AWS CLI 세션은 만료되어 새 IAM 권한·모델 접근 상태를 조회하지 못했습니다. 실제 모델 호출은 검증되지 않았습니다.

Lambda는 필수가 아니며 현재 Provider는 EC2에서 Bedrock을 직접 호출하도록 구현되어 있습니다. 직접 호출에는 EC2 실행 역할의 `bedrock:InvokeModel`이 필요합니다. Lambda를 경유하면 EC2에는 `lambda:InvokeFunction`, Lambda 실행 역할에는 `bedrock:InvokeModel` 권한이 필요합니다. [Converse 권한](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html), [Lambda 호출 권한](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html)

기존 서울 `sgu-202686-bedrock` Lambda는 챗봇 대화 이력 저장용으로 확인됐고, 사진 판별에는 연결하지 않았습니다. 과거 로컬 사용자의 Lambda `DryRun` 성공과 추론 프로필 조회는 EC2에서 이미지가 있는 Converse 요청이 성공한다는 뜻이 아닙니다. 사진 판별은 EC2 백엔드가 `us-east-1`의 `us.anthropic.claude-haiku-4-5-20251001-v1:0`을 직접 호출하도록 준비했습니다. 해당 프로필은 미국 내 `us-east-1`·`us-east-2`·`us-west-2`로 라우팅될 수 있으며, EC2 역할의 신뢰 관계·유효 권한과 Anthropic 최초 사용 요건을 확인해야 합니다. [관리자 설정 안내](deploy/iam-admin-setup.md)

기존 `GET /api/ai/status`와 `POST /api/ai/generate-report`는 이전 신고문 생성 API로 남아 있지만, 새 5단계 신고 화면에서는 사용하지 않습니다. `POST /api/reports/validate-photos`와 최종 `POST /api/reports`는 사진을 검사합니다. `bedrock` 모드에서는 이미지 내용도 판별하고, 모델 오류·시간 초과·권한 문제 시 접수를 막으며 무관한 사진의 교체를 요구합니다. `disabled` 모드에서는 형식 검사 후 접수하며 무관한 사진을 차단하지 못합니다. Mock 판별로 운영 신고를 통과시키지 않습니다.

### AWS 연결 상태와 사진 저장 모드

2026-10-15에 `parkick` 프로파일로 AWS 인증을 확인하고 사용자가 지정한 이름으로 아래 리소스를 생성했습니다. 이번 변경은 새 Parkick 리소스에만 적용했으며 다른 프로젝트의 리소스는 변경하지 않았습니다.

| 리소스 | 확인한 상태 |
| --- | --- |
| EC2 `sgu-202686-ec2` | 서울 `ap-northeast-2`, `i-0a95ee1a77e3722a4`, Ubuntu 24.04, `t3.small` 2 vCPU·2GiB, 실행 중·상태 검사 2/2 통과 |
| EC2 디스크·네트워크 | 암호화된 30GiB gp3, 인스턴스 종료 시 볼륨 보존, CPU 크레딧 Standard; 공인 IP `15.165.235.154`, 웹 80·443, SSH 22는 사용자 요청으로 `0.0.0.0/0` 허용 유지 |
| S3 `sgu-202686-s3` | 퍼블릭 액세스 차단 네 항목 활성화, Bucket owner enforced, SSE-S3(AES256); 개발 PC와 EC2 역할에서 테스트 객체 쓰기·읽기·내용 비교·삭제 성공 |
| EC2 앱 배포 | Node 22.23.3·PostgreSQL 16·Nginx 설치, npm ci·Frontend/Backend 운영 빌드·Migration·시연 seed 성공, API·DB·Nginx 서비스 활성화 |
| 현재 배포 릴리스 | `/srv/parkick/app` → `/srv/parkick/releases/20261103-staff-roles-1`; 5단계 신고·LiteLLM 사진 판별·촬영 중 AI 안내·공개 챗봇·관리자·수거 담당자 역할 분리·관리자 지도 집중·관심 구역(숫자 배지 제외)·비공개 S3 저장 |
| 현재 배포 접수 설정 | production·private-s3 저장, `AI_PROVIDER=litellm`; `/api/reports/status`의 `available: true`와 외부 HTTPS 사진 사전 검사 200/422 확인. 최종 신규 신고 제출은 아직 확인하지 않음 |
| HTTPS | `https://15.165.235.154`, Certbot 5.8.0의 shortlived IP 인증서 발급·적용; 자동 갱신 타이머 활성화, 갱신 dry-run·deploy hook 검사 통과 |
| EC2 IAM 역할 | 기존 `SafeInstanceProfile-sgu-202686`을 2026-10-23 연결하고 S3 쓰기·읽기·삭제를 확인. 사진 판별은 별도 LiteLLM HTTPS 프록시를 사용하며 EC2의 직접 Bedrock 모델 권한·호출은 미검증. [역할·AI 안내](deploy/iam-admin-setup.md) 참고 |

초기 EC2 배포에서는 사진까지 같은 서버에 저장했지만, 2026-10-23 운영 저장을 S3로 전환하고 기존 사진 6장(12,195,775바이트)을 이전·검증했습니다. 로컬 원본은 복구용으로 남겨두었습니다. 서버의 DB 비밀번호와 연락처 키 두 개는 서버 안에서 새로 생성했으며 개발 PC의 비밀값을 복사하지 않았습니다. 개발 PC의 `backend/.env`는 `REPORT_STORAGE_PROVIDER=local`을 유지하며 기존 AWS·관리자·DB·연락처 키는 보존했습니다. 초기 설치·외부 API 접수·모바일 Chrome 초기 흐름·HTTPS 갱신 검증을 완료했으며 S3 전환 후 브라우저 사진 조회·신규 신고 등 후속 운영 검증을 포함하는 **Phase 8은 진행 중**입니다. 상세 상태는 [배포 안내](deploy/README.md)와 [리소스 상태 파일](deploy/deployment-status.json)에 정리했습니다.

최초 SSH 연결 문제는 웹 IP 조회의 `211.234.206.233`과 당시 실제 SSH 출발지 `211.234.206.163`이 달라 발생했으며 출발지 확인 후 해결했습니다. 이후 `211.37.75.121/32` 제한으로 재접속을 확인했으며, 현재는 사용자의 최신 요청에 따라 TCP 22를 **`0.0.0.0/0`**에 계속 허용합니다. 자동 만료·복원은 없으며 사용자가 명시적으로 요청할 때만 변경합니다. Git SSH에서 ED25519 호스트 키를 검증해 접속합니다. EC2 공인 IP는 고정하지 않았으므로 중지·시작으로 주소가 바뀌면 인증서·Nginx·`FRONTEND_ORIGIN`도 다시 맞춰야 합니다.

현재 개발 PC 설정은 아래와 같습니다. AWS 로그인은 AWS 리소스 조회와 선택적인 S3·Bedrock 실제 연결 검사를 할 때 필요합니다. 로컬 Mock 사진 판별에는 필요하지 않습니다.

```powershell
aws login --profile parkick --region ap-northeast-2
```

```dotenv
REPORT_STORAGE_PROVIDER=local
AWS_PROFILE=parkick
AWS_REGION=ap-northeast-2
S3_REPORT_BUCKET=sgu-202686-s3
S3_REPORT_PREFIX=reports
```

`AWS_PROFILE`은 이 PC의 로그인 세션을 선택하는 로컬 설정이며 EC2 환경파일로 복사하지 않습니다. 설정을 반영하려면 실행 중인 Backend를 재시작합니다. 현재 EC2의 `s3` 사진 저장은 연결된 인스턴스 프로필의 임시 자격증명을 사용합니다. 운영 `litellm` 사진 판별은 서버 전용 프록시 키를 사용하며 EC2 역할의 직접 Bedrock 모델 권한을 요구하지 않습니다. 외부 HTTPS 사진 사전 검사는 통과했지만 최종 신고 제출은 별도 검증이 필요합니다.

```powershell
npm.cmd run aws:check
```

이 명령은 작은 테스트 JPEG 하나를 `S3_REPORT_PREFIX/connection-check/UUID.jpg`에 실제로 쓰고, 읽은 내용이 같은지 확인한 뒤 삭제합니다. 업로드·읽기·삭제 중 실패하면 종료 코드 1을 반환하며 자격증명이나 원본 AWS 오류를 출력하지 않습니다. S3 설정과 자격증명만 사용하므로 AI·개발 관리자·DB 연결 상태와 독립적으로 실행할 수 있습니다. 2026-10-23 개발 PC와 EC2 `parkick` 서비스 계정에서 `sgu-202686-s3` 대상 검사가 모두 통과했으며 테스트 객체를 삭제했습니다. 실제 웹 신고 제출은 별도 검증이 필요합니다.

개발 PC는 `REPORT_STORAGE_PROVIDER=local`, 운영 EC2는 `REPORT_STORAGE_PROVIDER=s3`를 사용합니다. 운영의 `REPORT_STORAGE_DIR=/var/lib/parkick/reports`는 이전한 사진의 원본 보존·복구용이며 HTTPS `FRONTEND_ORIGIN`과 비밀번호 DB 연결도 설정합니다. 개발 관리자 인증과 Mock AI는 운영에서 허용하지 않습니다. 저장 모드 변경만으로 기존 사진이 자동 이전되지는 않아 이전 도구로 6장을 옮기고 DB 경로를 변경했습니다. 상세 절차는 [배포 안내](deploy/README.md)에 있습니다.

### 개발 관리자 계정

로컬 개발 계정은 **`backend/.env`**에서 아래 항목을 설정한 다음 Backend를 재시작해야 활성화됩니다. **`.env.example`만 수정해도 런타임에 적용되지는 않습니다.** 예제 파일에는 실제 비밀번호를 보관하지 않습니다. 아래 `DEV_ADMIN_*` 설정은 EC2 운영 계정을 등록하는 방법이 아닙니다.

```dotenv
NODE_ENV=development
ENABLE_DEV_ADMIN=true
DEV_ADMIN_EMAIL=본인이_정한_이메일
DEV_ADMIN_PASSWORD=본인이_정한_12자_이상_128자_이하_비밀번호
DEV_ADMIN_NAME=개발 관리자
```

`DEV_ADMIN_EMAIL`에는 실제 이메일 형식을, `DEV_ADMIN_PASSWORD`에는 **12~128자 비밀번호**를 입력합니다. 예시 문자열을 그대로 사용하지 않습니다. `ENABLE_DEV_ADMIN=true`가 없으면 개발 인증은 비활성화되며 짧은 비밀번호로 활성화하면 설정 검증에서 서버 시작을 중단합니다. `/admin/login`에서 로그인하면 `/admin/dashboard`로 이동합니다.

개발 계정의 비밀번호는 서버 메모리에서 scrypt 해시로 관리합니다. 개발 세션은 HttpOnly 쿠키와 서버 메모리 저장소를 사용하며, 서버 재시작 시 사라집니다. 개발 인증은 기본 비활성화이며 `NODE_ENV=production`에서는 활성화할 수 없습니다.

DB 인증에서는 `Admin` 계정과 영속 세션으로 로그인합니다. 플랫폼 관리자 최초 등록은 서버의 [create-platform-admin.ts](deploy/create-platform-admin.ts)가 표준입력 JSON으로 받아 처리하며 비밀번호를 소스·명령 인자·로그에 남기지 않습니다. 운영은 `ENABLE_DEV_ADMIN=false`를 유지합니다. 통합 검증·EC2 배포와 지정한 플랫폼 관리자 등록·실제 로그인 검증을 완료했습니다. 새 관리자 DB 조회·테넌트 범위 권한·수거/견인·메모는 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다. 테넌트 계정 생성 UI·실제 관할 등록은 남아 있습니다. [등록 절차](deploy/README.md#플랫폼-관리자-최초-등록)에 상세 내용을 기록합니다.

로그인에서 **403 / `UNTRUSTED_ORIGIN`**이 반환되면 주소창의 프로토콜·호스트·포트와 `FRONTEND_ORIGIN`을 확인합니다. 기본값은 `http://localhost:5173`이며, `NODE_ENV=development`에서는 Vite가 안내하는 `http://127.0.0.1:5173`도 허용합니다. 다른 포트, 유사 도메인, Origin이 없는 변경 요청은 허용하지 않습니다. `.env`를 수정했다면 Backend를 재시작합니다. 두 로컬 주소의 쿠키는 각각 관리되므로 접속 주소를 바꾸면 다시 로그인합니다. Frontend의 `VITE_API_BASE_URL=/api`는 그대로 두어 같은 주소의 프록시를 이용합니다.

2026-10-09 로그인 403 수정 검증: 실제 실행 중인 로컬 프록시에서 로그인 200·세션 조회 200·로그아웃 204를 확인했습니다. 백엔드 Origin 회귀 5개를 포함한 20개 테스트와 `127.0.0.1` 브라우저 로그인 회귀를 포함한 E2E 14개, 전체 lint·build가 통과했습니다. 관리자 자격증명은 변경하지 않았습니다.

### 빌드와 검증

관리자 DB 인증 수정본은 Backend 단위/API **80/80개**, 실제 PostgreSQL 통합 **14/14개**(신규 인증 3개 포함), Backend lint·TypeScript 컴파일·Prisma 엔진 복사, Frontend lint·운영 빌드, 기존 관리자 로그인·로그아웃 브라우저 회귀 **1개**를 통과했습니다. DB 통합 검사는 앱을 종료한 뒤 독립 DB 연결로 다시 시작해 세션 유지와 재로그인·로그아웃의 세션 해지를 확인했습니다. EC2에는 `20261015-admin-auth-1`을 2026-10-15 23:31:02 KST에 반영했습니다. 실제 HTTPS에서 미인증 401 → 로그인 200(`database`, `PLATFORM_ADMIN`) → Secure·HttpOnly·SameSite=Strict 쿠키 → 새로고침 세션 복원·대시보드 200 → 로그아웃·기존 토큰 401을 확인했으며 브라우저 오류가 없었습니다. 기존 신고·사진·전화번호 키와 운영의 개발 인증 비활성화를 유지했습니다.

2026-10-15 신고 제출 지연·전화번호 조회 수정본의 검증 결과는 다음과 같습니다. **EC2의 `20261015-phase5-1` 릴리스로 반영했고 Linux 전체 운영 빌드·health와 실제 HTTPS 브라우저 신고·조회 검사를 통과했습니다.**

| 수정본 검증 | 결과 |
| --- | --- |
| Frontend lint·운영 빌드, Backend lint | 통과 |
| Backend 단위/API 테스트 | 74개 통과; 전화번호 목록·상세·공개 필드·공유 요청 제한 검사 포함 |
| 실제 PostgreSQL 통합 | 총 11개 통과: 기존 저장·DB 제약 8개와 전화번호 조회 3개 |
| 제출 브라우저 검사 | 합계 7개 통과: 65초 지연 응답 뒤 완료 화면 1개, 나머지 제출·조회 검사 6개 |
| 신고→조회 흐름 | 번호를 남긴 전체 Wizard 제출→완료→실제 DB 목록·상세→뒤로 이동→번호 변경 즉시 초기화→직접 상세 접근 시 재입력 확인 |
| Phase 1 브라우저 회귀 | 3개 통과: 홈·관리자 인증·DB 없는 조회의 실제 503 안내 |
| 2026-10-15 당시 EC2 HTTPS 브라우저 | 당시 6단계 신고→201→완료 영수증→전화번호 목록 200·no-store→상세 처리 이력 통과; 현재 5단계·사진 판별 소스의 운영 검증 결과는 아님 |
| 이번 운영 테스트 자료 | 테스트 2건의 표식·UUID·접수번호·내용·해시 일치 확인 후 해당 DB 관계·사진만 정리 완료; 기존 사용자 데이터 유지 |

운영 문제 확인 과정에서 이전 제출 요청은 약 62초 뒤 클라이언트 연결 종료 상태인 499로, 이후 요청은 약 55초 뒤 201로 기록됐습니다. 기존 60초 브라우저 제한이 느린 전송·접수 확인을 중단할 수 있어 제출 전용 요청을 XHR의 300초 제한으로 변경했습니다. 진행률은 실제 전송 바이트를 사용하고, 전송을 마치면 서버가 접수번호를 반환할 때까지 별도 확인 상태를 표시합니다. 이 기록에는 사용자 IP·전화번호·신고 내용 등 원문 로그를 포함하지 않습니다.

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:map
```

Schema 검사는 `setup:local`로 설정한 DB URL을 사용해 `npm.cmd run check:schema`로 실행합니다. Schema 검사만 필요하다면 아래 DB 설정 항목의 일회성 검사용 URL도 사용할 수 있습니다.

2026-10-15 초기 배포를 EC2의 비공개 로컬 사진 저장으로 변경한 뒤 **Backend 테스트 65개·Backend lint·TypeScript 컴파일·Prisma 엔진 복사**가 통과했습니다. 실제 EC2에서도 bootstrap, `npm ci`, Frontend·Backend 전체 운영 빌드, DB Migration·시연 seed를 완료했습니다. API production 상태, DB 연결, local 접수 준비와 사진 폴더 0700을 확인했습니다.

| 실제 EC2 배포 검증 | 결과 |
| --- | --- |
| 외부 HTTPS/API 검사 | 6개 통과: health/API, SPA 3개 경로·JS 번들, HTTP→HTTPS, 실제 전화번호 없는 테스트 신고 201·동일 요청 재전송 200, 공개 신고 사진 API 404 |
| 모바일 Chrome 390×844 | 5개 통과: secure context, 홈 이미지, 직접 입력에서 사진 단계 진입, 직접 주소 새로고침, 런타임 오류 없음 |
| 인증서 갱신·Nginx 재적용 hook | `certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew` 종료 코드 0, 모의 갱신 전체 성공 로그 확인; 자동 갱신 타이머 active |
| 테스트 데이터·파일 | 정확한 테스트 신고의 DB 관계, JPEG 해시·EXIF 제거·폴더 0700/파일 0600·실제 파일 경로의 비공개 접근 확인; 해당 테스트 신고·관계 데이터·사진 1개만 정리 완료 |

모바일 Chrome 검사는 브라우저의 모바일 화면 설정이며 실제 휴대전화 카메라·GPS나 시민의 전체 현장 신고 검증을 대신하지 않습니다.

같은 날 앞서 수행한 AWS 저장·배포 준비 변경 검증:

| 확인 대상 | 결과 |
| --- | --- |
| 전체 lint·Frontend 빌드 | 통과 |
| Backend TypeScript 컴파일·Prisma 네이티브 엔진 복사 | 통과 |
| Backend 전체 빌드 | 실행 중인 기존 개발 서버의 Prisma DLL 잠금으로 `prisma generate` 실패; 해당 서버는 중지하지 않음 |
| `npm.cmd test` | 최종 전체 재실행에서 Frontend 4개·Backend 62개 통과; 신규 S3 접수 통합 테스트 포함 |
| S3 모드 브라우저 표시·접수 흐름 | 실제 로컬 PostgreSQL과 S3 상태 응답 대역을 사용한 신규 1개 통과; 실제 S3 업로드 검증과 별개 |
| AWS CLI·SDK 읽기 전용 연결 | `parkick` 로그인·STS·EC2/S3 조회, `.env`를 읽은 SDK 버킷 목록 조회 성공 |
| `npm.cmd run aws:check` | 개발 PC에서 실제 `sgu-202686-s3` 테스트 JPEG 쓰기·읽기·바이트 비교·삭제 통과 |
| 생성한 EC2·S3 설정 조회 | EC2 실행 중·상태 검사 2/2, S3 공개 차단·소유권·암호화 확인; 당시 미완료였던 SSH·초기 앱 배포는 이후 위 기록처럼 완료 |

아래는 같은 날 Phase 4 로컬 접수를 처음 구현했을 때의 검증 기록입니다.

| 명령 | 확인 대상 | 결과 |
| --- | --- | --- |
| `npm.cmd run setup:local` | PostgreSQL 18.1·환경설정·Migration·개발 seed | 통과; 기존 설정·데이터 보존 |
| `npm.cmd run lint`, `npm.cmd run build` | 두 앱 lint·Frontend Vite·Backend TypeScript/Prisma 빌드 | 통과 |
| `npm.cmd run test --workspace backend` | 기존 API와 신고 입력·사진·연락처·재시도·실패 처리 | 52개 통과 |
| `npm.cmd run test --workspace frontend` | 사진 형식·시그니처·크기 경계 | 4개 통과 |
| `npm.cmd run test:submission` | 실제 로컬 PostgreSQL·사진 저장·브라우저 제출 | 4개 통과 |
| `npm.cmd run test:database` | 전용 테스트 DB의 제약·트랜잭션·seed | 8개 통과 |
| `npm.cmd run test:e2e` 및 해당 실패 항목 재실행 | 기존 신고 입력·생성·로그인 회귀 | 최초 21개 통과; API URL 판별 테스트를 수정한 뒤 나머지 1개 개별 재검증 통과 |
| `npm.cmd run test:map` | NAVER SDK 대역 상호작용·오류 처리 | 5개 통과 |
| `npm.cmd audit` | 설치된 의존성의 알려진 취약점 | 실행 시점 0건 |

기존 E2E 22개 시나리오는 최초 실행과 수정 후 개별 재실행으로 확인했으며, 수정 후 전체 22개를 한 번에 다시 실행한 결과는 아닙니다. 최초 실패는 개발 모듈 `/src/api/reports.ts`를 제출 API로 잘못 센 테스트 조건이었으며 URL pathname 판별로 수정했습니다. 컴파일된 Backend도 실제 접수 **201** 이후 앱·DB 연결을 다시 열고 같은 요청을 보내 **200**과 같은 접수번호를 반환하는 것을 확인했습니다. 이 로컬 접수 검증에서는 실제 AWS 호출을 하지 않았습니다.

아래는 2026-10-12 Phase 3 당시의 검증 기록입니다.

| 실제 실행 명령 | 확인 대상 | 최신 검증 기록 |
| --- | --- | --- |
| `npm.cmd install @aws-sdk/client-bedrock-runtime --workspace backend` | AWS SDK 3.1149.0 추가와 lock 갱신 | 2026-10-12 성공; 후속 `npm.cmd audit --json` 알려진 취약점 0건 |
| `npm.cmd run lint --workspace frontend`, `npm.cmd run lint --workspace backend` | 각 앱 ESLint | 2026-10-12 Phase 3 통과 |
| `npm.cmd run build --workspace frontend`, `npm.cmd run build --workspace backend` | Frontend TypeScript·Vite, Backend TypeScript | 2026-10-12 Phase 3 통과 |
| `npm.cmd run test --workspace backend` | AI 설정·Converse·입력 제한·실패·취소·관리자·Origin·QR | 2026-10-12 37개 통과; 신규 AI 테스트 17개 포함 |
| `npm.cmd run test --workspace frontend` | JPEG/PNG/WebP 시그니처·MIME·확장자·크기 경계 | 2026-10-12 4개 통과 |
| `npm.cmd run check:schema` | Prisma Schema 유효성 (`db:validate` 호출) | 2026-10-12 Model ID 한도 2,048자 반영 후 통과; 검사용 URL 사용, 실제 DB 연결·테이블 생성 미수행 |
| `npm.cmd run test:e2e` | Chrome 신고 입력·AI 문구·관리자 인증·브라우저 실패 경로 | 2026-10-12 22개 통과; Phase 3 생성·검토·취소 회귀 8개 포함 |
| `npm.cmd run test:map` | 지도 SDK 대역을 사용한 상호작용 | 2026-10-12 NAVER 지도 5개 통과; 실제 서비스 검증과 별개 |

위 결과는 2026-10-12 실제 검증 기록입니다. 지도 공급자 변경에 대한 과거 검증 범위는 아래 NAVER 지도 설정에도 기록합니다. 아직 완료되지 않은 검증은 통과로 표시하지 않습니다. `npm.cmd test`는 두 workspace 단위/API 테스트를, `npm.cmd run check:schema`는 Backend Schema 검사를 호출합니다. 패키지 감사는 실행 당시 알려진 취약점을 기준으로 합니다.

Phase 3 당시에는 실제 Backend Mock과 SDK 응답 대역으로 검사했습니다. 생성 요청의 개인정보·사진·QR 필드 배제, 프롬프트 지시와 사용자 자료 분리, 운영 Mock 차단, 시간 초과·차단·잘린 응답의 오류 처리, HTTP 연결 종료 시 취소 전파를 확인했습니다. 브라우저에서는 명시적 제안 적용, 수정문 보존, 기본 정보 변경 후 재검토, 생성 중 직접 입력·뒤로 이동 후 늦은 응답 무시, 실패·비활성화 시 직접 작성을 검증했습니다. 해당 검증에서는 AWS 계정·Bedrock 실제 출력·SMS·신고 DB/S3 저장을 호출하지 않았습니다.

2026-10-11 선택 연락처·인증 없는 조회 변경 검증: `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run check:schema`, `npm.cmd run test --workspace backend` 통과. `npm.cmd run test:e2e -- tests/e2e/phase-one.spec.ts tests/e2e/phase-two.spec.ts`는 8개 통과했습니다. 빈 번호로 마지막 화면 진입, 조건부 동의와 번호 삭제·재입력 시 초기화, 인증번호 단계 없는 조회 화면, 번호 형식 확인, 당시의 실제 조회 미연결 안내, 관리자 인증 유지를 확인했습니다. 이 날짜에는 실제 신고 저장·조회 성공 검증이 후속 단계 대상이었습니다.

브라우저 검증은 **설치된 Google Chrome**을 사용합니다. `npm.cmd run test:e2e`는 별도 포트 5175/4015에서 테스트 서버 2개를 자동 시작하고 테스트 전용 무작위 관리자 비밀번호를 프로세스 메모리에서 생성합니다. `AI_PROVIDER=mock`, 빈 `DATABASE_URL`로 실제 AWS 호출과 신고 저장을 비활성화하며, 입력·인증·접수 미연결 상태를 검사합니다. 개발 계정 비밀번호를 테스트 파일이나 `.env`에 저장할 필요가 없습니다. 두 포트가 비어 있어야 합니다. Chrome이 없다면 먼저 설치하거나 Playwright Chromium을 설치하고 `playwright.config.ts`의 `channel` 설정을 맞춰야 합니다.

실제 신고 저장 검증은 별도로 실행합니다. `setup:local`을 마친 후 다음 순서로 실행하면 됩니다.

```powershell
npm.cmd run db:start
npm.cmd run test:submission
npm.cmd run test:database
```

`test:submission`은 `tests/submission/phase-four.spec.ts`, `phase-five.spec.ts`, `aws-mode.spec.ts`와 `playwright.submission.config.ts`를 사용합니다. 5176/4016 포트와 전용 `parkick_test` DB에서 실행하며, 시작 전에 해당 DB에 Migration·seed를 적용합니다. `test:database`도 같은 테스트 DB에서 제약과 트랜잭션을 검사하므로 위 순서로 먼저 테스트 Schema를 준비합니다. 사용자 `.env`의 DB로 테스트를 돌리지 않으며 reset·truncate로 기존 데이터를 지우지 않습니다. 테스트마다 별도 ID와 임시 연락처 키를 사용하고, E2E 사진은 `test-results/submission-evidence`에 저장합니다. 두 검증에는 실제 PostgreSQL이 실행 중이어야 하며 AWS 호출은 하지 않습니다.

`npm.cmd run test:map`은 `playwright.map.config.ts`를 사용하며 Frontend 테스트 포트 5188이 비어 있어야 합니다. 테스트 전용 가짜 공개키와 SDK 대역을 사용해 실제 NAVER 계정에 접속하지 않습니다.

Phase 1에서 확인한 홈·관리자 반응형 화면, 로고, 로그인·로그아웃·인증 차단 검증을 유지하며 Phase 2에서는 사진 검증·필수 단계 입력·QR 수동 대체·좌표 수정 경로를 확장합니다. 화면 캡처는 `test-results/browser/`에 생성됩니다. NAVER 지도 별도 테스트는 브라우저에 SDK 대역을 주입하므로 실제 키·도메인 권한·지도 타일·주소 데이터의 정상 동작을 보증하지 않습니다. 실제 스마트폰 카메라·GPS·Safari와 실제 NAVER 계정 검증은 아직 수행하지 않았습니다.

카메라 테스트는 `canvas.captureStream()`으로 영상 입력을 모의 처리하며 권한 대기 중 취소·재시작·화면 이탈 후 늦은 응답의 스트림 정리를 확인합니다. 영상과 파일 QR 디코딩은 실제 `qr-scanner`를 사용합니다. `tests/fixtures/unknown-qr.png`는 `qrcode@1.5.4`로 생성한 테스트용 QR이며, 내용은 `https://unverified.example.invalid/device/phase2-test`입니다. 실제 업체 규격이나 실제 현장 증빙이 아닙니다. 사진 디코딩·용량·2장 제한·교체·삭제·URL 해제, 필수값 보완 시 오류 해제, GPS 거부·좌표 수정, 뒤로 이동 시 입력 유지 및 DB 비활성 상태의 제출 차단도 검사합니다.

Phase 1 원본 보존 확인: `docs` 2개, `asset` 4개, `page` 3개 **총 9개 파일의 SHA-256이 작업 전후 동일함을 확인했습니다.** Frontend에 복사한 투명 로고 2개도 원본과 바이트가 동일합니다. Phase 2·3 작업도 해당 원본을 수정하지 않았습니다.

필요하면 개별 앱도 검증할 수 있습니다.

```powershell
npm.cmd run lint --workspace frontend
npm.cmd run build --workspace frontend
npm.cmd run test --workspace frontend
npm.cmd run lint --workspace backend
npm.cmd run build --workspace backend
npm.cmd run test --workspace backend
npm.cmd run db:validate --workspace backend
```

Frontend 빌드 결과는 `frontend/dist`, Backend 빌드 결과는 `backend/dist`입니다. Frontend 빌드 미리보기는 `npm.cmd run preview --workspace frontend`, Backend 컴파일 결과 실행은 `npm.cmd run start --workspace backend`입니다. Vite preview는 설정된 API 프록시를 상속하지만, 포트가 달라지므로 로그인까지 확인하려면 Backend의 `FRONTEND_ORIGIN`을 실제 미리보기 주소에 맞춰 재시작해야 합니다. 운영 배포에서는 별도 정적 호스팅과 `/api` 리버스 프록시를 구성합니다.

## Phase 0 분석 기록

분석 기준일: **2026-10-08, Asia/Seoul**. 원본 분석 기록을 유지하면서 아래 기술 구조와 구현 상태는 Phase 5 기준으로 갱신했습니다. 우선순위는 최신 사용자 요구사항 → `docs` 설계 → `page` 디자인 → 일반 개발 관행입니다.

### 1. 프로젝트 요구사항 이해

시민은 회원가입·로그인 없이 신고합니다. 로그인은 관리자에게만 제공합니다.

```text
홈 → 신고하기 → QR 촬영 또는 업체·기기번호 직접 입력 → 현장사진 첨부·형식 검사(선택적으로 LiteLLM 또는 직접 Bedrock 내용 판별)
→ 위치 확인·수정 → 신고유형 복수 선택
→ 전화번호 선택 입력(입력 시에만 수집·이용 동의)
→ 인증 없이 제출 → 신고번호

처리결과 조회 → 신고 때 남긴 전화번호 입력
→ 인증 없이 해당 번호를 남긴 신고 내역·진행 상태 조회

관리자 로그인 → Dashboard → 목록·상세 → 처리 시작
→ 수거 또는 견인 완료 확인 → 완료 방식·처리 메모·이력 저장
```

신고 처리 상태는 `RECEIVED(접수) → PROCESSING(처리중) → COMPLETED(처리완료)`입니다. QR 판독에 실패하면 업체와 기기번호를 직접 입력합니다. `AI_PROVIDER=litellm` 또는 `bedrock`에서 사진을 무관하다고 판단하거나 모델이 응답하지 않으면 접수하지 않고 사진 교체·재시도를 안내합니다. `AI_PROVIDER=disabled`이면 사진 형식 검사 후 접수하며 내용 관련성은 확인하지 않습니다. 활성화된 모델 판별은 정제된 JPEG를 설정한 LiteLLM 프록시 또는 직접 Bedrock 모델로 전송합니다.

**2026-10-11 최신 요구사항:** 신고 시 전화번호는 선택 입력이며 신고·결과 조회 모두 전화번호 인증을 요구하지 않습니다. 결과를 보고 싶을 때 신고에 남긴 번호를 입력하면 해당 번호의 신고 내역과 진행 상태를 조회합니다. 번호를 남기지 않은 신고를 나중에 입력한 전화번호와 자동으로 연결하지 않습니다. OTP·SMS와 전화번호 본인확인 기능은 현재 개발 계획에서 제외합니다.

관리자의 수거·견인 완료는 `COMPLETED` 상태와 완료 방식(`COLLECTED` 수거 / `TOWED` 견인)을 함께 기록하도록 설계합니다. 시민의 신고 제출 완료와는 별개이며, 실제 완료 처리 기능은 Phase 6 수정본에서 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다.

### 2. docs 분석 결과

`docs/Parkick_프로젝트_구현_계획서.md`와 같은 이름의 **27페이지 PDF**를 확인했습니다. 모두 2026-10-08 작성된 v1.0 계획서이며 PDF는 동일 문서를 편집한 형태입니다. 원본 문서를 수정하지 않습니다.

문서는 신고 중심 운영 플랫폼, AI 보조, 교체 가능한 모델, 비공개 이미지 저장, 입력 검증, 관리자 이력, 연구 재현성을 강조합니다. 최신 요청과 충돌하는 내용은 아래처럼 적용합니다.

| 문서의 기존 설계 | 이번에 적용하는 최신 요구사항 |
| --- | --- |
| 사진부터 시작하는 신고 | QR부터 시작하며 수동 업체·기기 입력을 허용 |
| 전화번호 기본 미수집 | 전화번호 선택 입력, 입력한 경우에만 수집·이용 동의; 신고 시 인증 없음 |
| 신고번호 + 조회 토큰 | 신고 때 남긴 전화번호만 입력해 해당 번호의 신고 내역·진행 상태 조회 |
| 접수 후 비동기 분류·요약 | 신고문 작성 단계 없이 서버가 선택 유형으로 보관용 요약 생성, 선택적 설명은 별도 저장 |
| 이미지 분석·우선순위 추천 | `bedrock` 모드에서만 현장 사진의 공유 킥보드·자전거 관련성 확인; 우선순위 추천은 제외 |
| 7개 내부 처리 상태 | RECEIVED / PROCESSING / COMPLETED |
| Phase 1에 신고 저장·S3 연결 | Phase 4에서 로컬 신고 저장과 S3 어댑터 구현; 실제 AWS 저장·배포 검증은 별도 진행 |
| 초기부터 실제 지도 키 연결 | 키가 없으면 미연동 상태를 명확히 표시 |
| 상시 AI Worker + SQS | `bedrock` 모드에서만 요청 시 사진 판별; Queue는 향후 필요 시 |
| 분류 정확도·멀티모달 연구 | 사진 판별 품질·오판율·응답시간 검증은 모델 접근 후 수행 |

EXIF 제거, 비공개 S3, CORS 허용목록, 요청 크기 제한, 연구용 데이터 비식별화 등 충돌하지 않는 요구사항은 유지합니다.

### 3. asset 분석 결과

파일명만으로 형태를 추정하지 않고 실제 이미지의 비율과 투명도를 확인했습니다.

| 원본 파일 | 실제 형태 | 적절한 위치 |
| --- | --- | --- |
| `asset/parkick_logo_text_noback.png` | 2172×724, 투명 배경, 가로 로고 | Public Header, Footer, 관리자 Sidebar |
| `asset/parkick_logo_noback.png` | 1254×1254, 투명 배경, 정사각 심볼 | favicon, 좁은 공간의 브랜드 심볼 |
| `asset/parkick_logo.png` | 2172×724, 불투명 배경, 가로 로고 | 흰 배경 인쇄·발표자료 |
| `asset/parkick_logo_text.png` | 1254×1254, 불투명 배경, 정사각 심볼 | 흰 배경 브랜드 이미지 |

투명 로고 2종을 `frontend/public/assets/`에 복사하여 사용합니다. 원본 형태를 다시 그리거나 수정하지 않습니다. 로고의 파란색은 대략 `#0048A0`~`#0050B0`, 초록색은 `#40B838` 계열입니다. 래스터의 안티앨리어싱·그라데이션 때문에 파일별 픽셀 색상에 차이가 있습니다. 디자인 토큰은 이 계열을 대표값으로 정하고 실제 텍스트 대비를 고려해 사용합니다.

### 4. page 분석 결과

`page`에는 모두 1448×1086 크기의 PNG 참고 이미지 3개가 있습니다. 화면 이미지를 통째로 보여주지 않고 React 컴포넌트로 구성합니다.

| 참고자료 | 관찰한 디자인 | 대응 Route |
| --- | --- | --- |
| `파킥홈페이지.png` | Desktop·Mobile, 흰 Header, 검정/파랑/초록 Hero 제목, 큰 CTA 2개, 3단계 안내, 도움말 카드 4개 | `/` |
| `신고페이지.png` | QR·사진·정보 입력의 모바일 화면 3개, 파란 단계 표시, 둥근 흰 카드와 입력 컨트롤 | `/report` |
| `파킥 관리자 대시보드 UI 목업.png` | Sidebar, 5개 KPI, 넓은 지도+보조목록, 도넛·막대 차트, 최근 신고 표, 모바일 변형 | `/admin/dashboard` |

완료·조회·로그인·신고 목록·상세의 독립 디자인은 없으므로 같은 색상, 여백, 카드, 버튼 언어를 확장합니다. 신고 UI는 **5단계**로 구성합니다. Hero의 사진은 별도 원본 asset이 아니므로 공식 로고와 코드 기반 구성으로 화면을 만듭니다.

### 5. 기존 코드 상태

분석 시작 시 프로젝트에는 `docs`, `asset`, `page`만 있었으며 기존 애플리케이션 코드·`package.json`·환경설정·Git 저장소가 없었습니다. 재사용할 앱 코드가 없어 신규 기반을 구성했습니다. Git 초기화나 커밋을 자동으로 수행했다고 가정하지 않습니다.

### 6. 디렉터리 구조

```text
parkick/
├─ docs/                   # 원본 설계문서, 수정 금지
├─ asset/                  # 공식 로고 원본, 수정 금지
├─ page/                   # UI 참고 원본, 수정 금지
├─ frontend/
│  ├─ public/assets/       # 공식 로고 복사본
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  ├─ features/
│  │  └─ api/
│  └─ .env.example
├─ backend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  ├─ services/
│  │  ├─ repositories/
│  │  └─ types/
│  ├─ prisma/              # Schema·Migration·개발 seed
│  ├─ scripts/             # 로컬 DB·환경설정 도구
│  ├─ data/                # 로컬 DB·비공개 사진, 버전 관리 제외
│  ├─ test/
│  └─ .env.example
├─ package.json            # npm workspace와 공통 명령
├─ package-lock.json
├─ playwright.config.ts    # 독립 테스트 서버·Chrome 설정
├─ tests/e2e/              # 브라우저 검증
├─ .env.example            # 앱별 설정 위치 안내
├─ .gitignore
└─ README.md
```

### 7. 권장·선택 기술 스택

| 영역 | 현재 선택 | 후속 단계 |
| --- | --- | --- |
| Frontend | React 19, TypeScript 5.9 strict, Vite 7, React Router 7 | 필요 시 TanStack Query, React Hook Form |
| 스타일 | Tailwind CSS 4 + 브랜드 CSS 토큰, Lucide 아이콘 | 실제 데이터 차트 도입 시 Recharts 검토 |
| Backend | Node.js, Express 5, TypeScript strict, Zod 4, 신고·전화번호 조회 Repository, DB 관리자 인증·영속 세션 | 신고 관리·테넌트 범위 권한 로컬·EC2 검증 완료 |
| 인증 | scrypt + HttpOnly 쿠키 + 개발용 메모리 세션 | DB 세션 저장소·운영 계정 관리 |
| QR | qr-scanner 1.4, Backend Parser 등록 구조 | 실제 업체 QR 샘플 검증 후 Parser 추가 |
| 위치 | 브라우저 Geolocation, NAVER Maps SDK 어댑터, 수동 좌표 | 실제 키·도메인·모바일 기기 검증, 지역 판별 |
| DB | PostgreSQL, Prisma 6.19.3, Migration·seed·트랜잭션 저장 | 운영 DB·백업 정책 |
| 사진 | 로컬/S3 JPEG 저장 어댑터, 개발 PC 실제 S3 검사와 EC2 API 접수·중복 재시도·실제 사진 검증 및 테스트 자료 정리 통과 | S3 역할·이관은 후속 선택 사항 |
| 외부 서비스 | 선택적 Bedrock 사진 판별·S3·NAVER 어댑터, 개발 Mock | 모델 호출·사진 저장·지도 실증 |

이번 규모에서는 `frontend`/`backend` npm workspace로 실행·설치를 통일합니다. Provider 교체 지점은 유지하되 별도 Worker·공유 패키지를 불필요하게 늘리지 않습니다.

Prisma의 전이 의존성 `deepmerge-ts`는 [알려진 보안 문제 GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)에 대응하기 위해 루트 `overrides`에서 `8.0.0`으로 지정합니다. Prisma Schema 검사를 함께 실행해 도구 동작을 확인합니다. 패키지 설치 시점의 감사 결과는 이후 새 공지에 따라 달라질 수 있습니다.

### 8. 최종 Frontend Architecture

```text
Route
├─ Public Layout → Home / Report Wizard / Completion / Status
└─ Admin Guard → Admin Layout → Dashboard / Reports / Detail
                 ↓
           공통 Component
                 ↓
      Feature 상태·입력 검증 → API Client → Backend
```

Public은 모바일 약 390px에서 큰 CTA·명확한 단계·한 손 입력을 우선하고 Tablet·Desktop으로 확장합니다. Admin은 Desktop Sidebar·표·지도 중심이며 좁은 화면에서 Navigation과 그리드를 재배치합니다. 페이지에 외부 서비스 호출을 직접 분산하지 않고 `api`와 `features`에 경계를 둡니다.

최종 Public Route는 `/`, `/report`, `/report/complete`, `/report/status`, `/report/status/:publicId`입니다. Admin Route는 `/admin/login`, `/admin/dashboard`, `/admin/map`, `/admin/reports`, `/admin/reports/:id`입니다. 로그인 화면을 제외한 관리자 경로는 인증이 필요합니다. 신고 제출·완료·전화번호 조회·공개 상세는 실제 API에 연결했으며 관리자 실데이터 화면은 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다. 조회 목록과 상세 사이에서는 메모리 상태를 유지하고 조회 화면을 나가거나 새로고침하면 번호를 다시 입력합니다.

### 9. 최종 Backend Architecture

```text
Route → Controller → Service → Repository → PostgreSQL
                         ├─ PhotoValidationService → 선택적 Bedrock
                         ├─ EvidenceStorage → LocalEvidenceStorage / S3EvidenceStorage
                         └─ QRParsingService → OperatorMatcher → 등록된 Parser / GenericQRParser
```

Route는 URL과 미들웨어, Controller는 HTTP 입출력, Service는 업무 규칙, Repository는 데이터 접근을 담당합니다. 신고는 Prisma Repository로 PostgreSQL에 저장하고, 사진은 공통 검증·정제 후 `REPORT_STORAGE_PROVIDER`에 따라 비공개 로컬 폴더 또는 S3로 전달합니다. S3 어댑터는 서버에서 정제한 JPEG만 업로드하고 실패한 시도의 객체를 정리합니다. 개발 PC·EC2 역할의 실제 S3 검사와 기존 사진 6장 이전·조회 검증을 완료했습니다. EC2의 local API 접수 201·중복 재전송 200은 초기 릴리스에서 확인했으며 S3 전환 후 실제 신규 신고 제출은 아직 확인하지 않았습니다. 현재 메모리 저장소는 개발 관리자 인증에만 사용합니다.

### 10. 공통 UI Component 구조

| 분류 | 책임·후보 |
| --- | --- |
| Branding·Layout | ParkickLogo, PublicHeader, Footer, AdminSidebar, AdminHeader |
| 입력·행동 | Primary/Secondary Button, FormField, Input, Select, Textarea, Checkbox |
| 신고 | ReportStepIndicator, 단계별 입력 Panel, 개인정보 안내 |
| 관리자 | DashboardStatCard, ReportTable, StatusBadge, ReportDetailPanel |
| 상태 | EmptyState, LoadingState, ErrorState, 명확한 MOCK·미연동 안내 |

색상만으로 상태를 전달하지 않고 텍스트·아이콘을 함께 사용합니다. 폼 label, 키보드 focus, 에러 안내, 충분한 터치 영역을 제공합니다. API 상태 처리와 모의 데이터 안내를 공통 패턴으로 유지합니다.

### 11. Database Schema

`backend/prisma/schema.prisma`와 초기 SQL Migration을 제공합니다. `setup:local`이 프로젝트 전용 PostgreSQL에 적용하고 개발 테넌트·지역·신고 유형 10개를 준비합니다. 운영 관리자 계정은 seed로 생성하지 않습니다.

| Entity | 주요 데이터·관계 |
| --- | --- |
| Tenant / Region | 도입 지자체·관할 지역 소유권; 개발 seed는 실제 관할과 무관한 `local-development` |
| Admin | email unique, passwordHash, name, 생성 시각, 완료를 등록한 신고 관계 |
| AdminSession | 서버 세션 토큰 해시, adminId, 만료·해지 시각; DB 인증 수정본은 영속 저장, 개발 Mock은 메모리 저장 |
| Operator | name, active, 검증된 QR 규칙 metadata |
| Report | 내부 UUID, publicId·submissionId·요청 해시, 업체·기기·QR 원문, 좌표·주소, 추가 설명·서버 생성 신고 요약(`finalReportText`), 선택 연락처와 동의, 상태·시각 |
| ReportImage | reportId, objectKey, MIME, 크기, 생성 시각, 메타데이터 처리 추적 |
| ReportCategory | 확장 가능한 유형·활성 여부 |
| ReportCategoryRelation | reportId + categoryId, 복수 유형 연결 |
| ReportStatusHistory | 이전/새 상태, 수거/견인 방식, 관리자, 공개 가능한 처리 내용과 내부 메모 구분, 시각 |
| ReportAIGeneration | 이전 신고문 생성 연구용 Schema; 현재 사진 판별의 결과 저장에는 사용하지 않음 |

`publicId`는 서버에서 만든 `PK-날짜-무작위값`이며 내부 증가 ID를 노출하지 않습니다. `submissionId`와 입력·사진 해시로 같은 제출의 재시도를 구분합니다. 전화번호는 정규화 후 AES-256-GCM으로 암호화하고 별도 키의 HMAC-SHA-256 검색값과 마스킹 표시값을 저장합니다. 키 회전·기존 데이터 재암호화는 후속 운영 작업입니다.

**선택 연락처:** `Report`의 연락처 암호문·암호화 키 버전·조회 HMAC·HMAC 키 버전·마스킹 값·전화번호 수집 동의 버전·동의 시각은 모두 nullable입니다. `phone: null` 또는 빈 문자열로 제출하면 일곱 필드를 모두 `null`로 저장하고, 번호를 입력하면 형식과 동의를 확인한 뒤 일곱 필드를 함께 저장합니다. 빈 번호를 암호화하거나 HMAC으로 만들지 않고 동의 시각도 임의로 채우지 않습니다. 이 일괄 조건은 Phase 4 서비스 검증과 Migration CHECK 제약으로 강제합니다. 전화번호는 암호화해 보관하고 서버에서 만든 HMAC을 향후 검색에 사용하며, HMAC은 본인 인증 수단이 아닙니다. 사용하지 않는 `PhoneVerification` 모델과 OTP Provider 계약은 제거했습니다.

DB는 신고 상태와 이전 AI 생성 기록용 Schema를 분리합니다. 새 5단계 신고에서 `finalReportText`는 서버가 선택 유형·기타 설명을 요약해 채웁니다. 클라이언트가 보낸 AI 생성문이나 측정값은 새 접수에 사용하지 않습니다. 과거 클라이언트의 동일 제출 재시도만 이전 `finalReportText` 형식을 허용합니다. `ReportAIGeneration`은 후속 연구 기록용 Schema로 남아 있습니다.

**수거·견인 완료 요구사항:** Schema에 `ReportCompletionMethod`, `Report.completionMethod`, `Report.completedByAdminId`와 관리자 관계, `ReportStatusHistory.completionMethod`가 있습니다. 기존 `completedAt`과 내부·공개 메모를 함께 사용합니다. 완료 상태에서는 방식·등록 관리자·등록 시각이 모두 있어야 하고 미완료 상태에서는 세 필드가 모두 비어 있어야 하며, 초기 SQL Migration의 CHECK 제약으로 강제합니다. 실제 완료 처리 API·권한 검사·관리자 화면은 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다. 관리자 삭제로 이력이 사라지지 않도록 관계는 `Restrict`로 두고 계정 비활성화를 사용합니다.

**여러 지자체 도입 요구사항:** Tenant·Region·관리자 역할/소속과 `Report.tenantId`·`Report.regionId`를 추가했습니다. 복합 외래 키로 다른 테넌트의 지역이 섞이지 않도록 제한합니다. 현재 개발 접수는 서버 설정의 `local-development` 지역에만 배정하며 클라이언트의 테넌트·지역 ID는 받지 않습니다. 실제 좌표 기반 관할 판별과 미도입 지역 정책, 관리자별 담당 지역 접근 제한은 운영 연결 전에 구현해야 합니다.

### 12. REST API 구조

API Prefix는 `/api`입니다. 아래에서 **설계/TODO는 성공 동작이 구현되었다는 뜻이 아닙니다.** 공개 신고 조회에는 입력 검증·전화번호 일치 검색·응답 필드 제한을 구현했습니다. DB 관리자 인증은 구현·EC2 배포 검증을 완료했으며, 테넌트 권한과 실제 관리자 데이터 연결은 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다.

| Method·경로 | 역할 | 단계·상태 |
| --- | --- | --- |
| `GET /api/health` | API 상태와 서비스 모드 | 현재 코드 `phase: 5`; AWS 실연결 검증과 별개 |
| `POST /api/admin/auth/login` | 관리자 로그인 | DB 계정·영속 세션 인증 구현·EC2 검증 완료; 로컬 개발 Mock 유지 |
| `GET /api/admin/auth/me` | 세션 사용자 확인 | DB·개발 Mock 모드, 만료·해지·계정 활성 상태 확인; EC2 세션 복원 검증 완료 |
| `POST /api/admin/auth/logout` | 세션 종료 | DB 세션 해지 완료 후 응답; EC2 기존 토큰 무효화 검증 완료 |
| `POST /api/qr/parse` | QR 원문 해석·미확인 대체 | 카카오·빔·지쿠의 검증 형식 업체/기기, 지쿠 이전 형식 업체만; 선택적 `selectedOperatorId`로 빔 5자리 번호 확인 |
| `POST /api/uploads/presign` | 브라우저 직접 업로드 URL | 미제공; 현재는 multipart 제출을 받은 서버가 정제 후 저장 |
| `GET /api/ai/status` | 이전 신고문 생성 API의 모드 확인 | Phase 3 기능으로 남아 있으나 5단계 화면에서는 미사용 |
| `POST /api/ai/generate-report` | 이전 신고문 생성 API | Phase 3 기능으로 남아 있으나 5단계 화면에서는 미사용 |
| `GET /api/reports/status` | 접수 준비 상태·저장 모드·사진 판별 모드 | `disabled`여도 DB·지역이 준비되면 `available: true`; 실제 AWS 호출 성공 보장은 아님 |
| `POST /api/reports/validate-photos` | 사진 1~2장 사전 확인 | multipart `photos`만 수신; 운영 `disabled`는 형식 검사만 하고 정상 PNG 200·PNG 위장 텍스트 400 확인, `bedrock`은 무관한 사진 422·모델 장애 503 |
| `POST /api/reports` | 업체·기기번호와 사진 재검증 후 신고 저장 | 신규 201 / 동일 내용 재시도 200 계약; 새 릴리스의 실제 제출은 아직 검증하지 않음 |
| `POST /api/reports/lookup` | JSON 본문의 `phone`, 선택 `page`로 번호가 일치하는 신고 목록 조회 | Phase 5 구현; 페이지당 20건, `hasMore` 제공 |
| `POST /api/reports/lookup/:publicId` | JSON 본문의 `phone`과 신고번호가 모두 일치하는 공개 처리 상세 | Phase 5 구현; 처리 이력 포함, 인증·OTP 없음 |
| `GET /api/admin/dashboard` | 인증된 관리자 집계 화면 | DB 전체·당일(KST)·상태별 집계와 최근 10건; 로컬·EC2 검증 완료 |
| `GET /api/admin/reports` | 인증된 관리자 신고 목록 | DB 필터·검색·페이지 이동·테넌트 범위 검사; 로컬·EC2 검증 완료 |
| `GET /api/admin/reports/map` | 관리자 지도용 실제 좌표 목록 | 서버 테넌트 범위·상태/검색, 기본 200건·최대 500건; 구현·로컬·EC2 실제 SDK 검증 완료 |
| `GET /api/admin/reports/:id` | 관리자 상세 | DB 상세·비공개 사진·이력 연결; 로컬·EC2 검증 완료 |
| `PATCH /api/admin/reports/:id/status` | 상태·수거/견인 완료·메모 변경과 이력 저장 | 처리중·수거/견인·공개/내부 메모 저장; 로컬·EC2 검증 완료 |
| `GET /api/admin/reports/:id/related` | 같은 기기 관련 신고 후보 | 같은 테넌트·지역·업체·번호, 미완료·100m·전후 24시간, 완료 시점으로 사건 구분 |
| `PATCH /api/admin/reports/:id/related/status` | 명시적으로 선택한 신고 함께 완료 | 현재 신고 포함 2~100건, 수거/견인·메모·개별 이력 원자적 저장; 버전 충돌 시 전체 취소 |

현재 미구현 기능에 대해 생성 성공·조회 성공·저장 성공을 가장하지 않습니다. 일관된 에러 형식과 서버 측 관리자 인증을 사용합니다. 단순히 Frontend Route를 숨기는 것만으로 관리자 API 권한을 보호하지 않습니다.

미구현 Public API는 아직 Route에 연결하지 않아 404를 반환합니다. 새 관리자 상세·변경 API는 서버 인증과 테넌트 범위를 검사합니다. 현재 EC2 릴리스에서 실제 조회·완료 처리·공개 메모 조회를 검증했습니다. POST/PATCH는 허용된 Origin과 JSON 요청이 필요하며, **`POST /api/reports`와 `POST /api/reports/validate-photos`는 `multipart/form-data`**를 사용합니다. Origin 검사는 업로드 본문을 읽기 전에 수행합니다. 기본적으로 `FRONTEND_ORIGIN`과 일치해야 하며, 개발 환경의 로컬 주소에서만 같은 프로토콜·포트의 `localhost`↔`127.0.0.1`을 함께 허용합니다. CORS와 변경 요청 검사는 같은 허용 목록을 사용합니다. 로그아웃도 JSON `{}`를 전달합니다.

신고 제출은 JSON 문자열 `report` 필드 한 개와 `photos` 파일 1~2개를 함께 보냅니다. 새 5단계 화면의 `report`는 `submissionId`(UUID), `operator`, `deviceId`, `qrRawData`, `latitude`, `longitude`, `address`, `categories`, `additionalDescription`, `phone`, `consent`를 보냅니다. **신규 접수의 업체·기기번호는 필수**이고, 주소·QR 원문·선택 전화번호는 `null`일 수 있습니다. 과거에 접수한 신고의 동일 내용 재시도를 위해서만 이전 클라이언트의 `finalReportText`·`reportConfirmed` 필드를 받아들입니다. 신규 접수의 요약은 서버가 유형·기타 설명에서 만듭니다. 클라이언트의 테넌트·지역 ID나 AI 메타데이터는 받지 않습니다. 업체 80자·기기 100자·주소 300자·QR 4,096자·추가 설명 500자 제한과 유형·좌표·연락처를 서버에서 검증합니다.

신규 접수는 **201**, 같은 `submissionId`와 같은 내용의 재시도는 기존 접수번호로 **200**을 반환합니다. 같은 ID로 본문·전화번호·사진을 바꾸면 **409 `SUBMISSION_CONFLICT`**입니다. 서버는 정규화한 입력과 전화번호 HMAC·원본 사진 SHA-256을 포함한 요청 해시로 동일 여부를 판단합니다. Frontend는 내용이 같으면 ID를 유지하고 사진 교체 등 제출 내용이 바뀌면 새 UUID를 사용합니다. 제출 중 입력·앱 내 이동·중복 클릭을 막고 XHR의 실제 전송률을 표시합니다. 전송 완료는 접수 성공과 구분하며 서버 응답까지 기다립니다. 300초 후에도 결과를 확인하지 못하면 입력과 UUID를 유지하고 같은 내용으로 재시도하도록 안내합니다.

성공 응답은 `publicId`, `status: "RECEIVED"`, `createdAt`, `address`, `latitude`, `longitude`, `hasContact`만 포함합니다. 사진 경로·전화번호·내부 메모는 반환하지 않습니다. 신고·사진 메타데이터·유형 연결·초기 접수 이력은 하나의 DB 트랜잭션으로 저장합니다. `GET /api/reports/status`의 `available`은 지역·테넌트 DB 상태를 확인하며, 사진 판별 모드는 별도의 `photoValidation`으로 알립니다. `disabled`에서도 접수할 수 있지만 상태 응답은 LiteLLM·Bedrock·디스크·S3 실제 호출 성공을 보장하지 않습니다. `photoValidation`은 `litellm`·`bedrock`·`mock`·`disabled` 중 하나입니다.

### 13. QR 처리 구조

`QRScanner`가 카메라 영상 또는 사진에서 `qr-scanner`로 원문을 읽고 Backend에 전달합니다. `BaseQRParser`는 원문과 검증된 해석 결과를 분리합니다. `QRParsingService`는 실물 사진으로 확인한 카카오 T 바이크·빔·지쿠 Parser를 등록합니다. `OperatorMatcher` 자체는 빈 목록으로도 주입할 수 있습니다. 테스트 전용 가상 포맷은 운영 Parser로 등록하지 않습니다.

QR 디코딩에는 사진의 크기·명암·초점이, 업체·기기번호 해석에는 확인된 규칙이 영향을 줍니다. QR 해독용 사진은 브라우저에서 축소·영역 분할·명암 보정으로 재시도하며 외부로 업로드하지 않습니다. 업체별 자동 판별을 추가하려면 업체명, 실제 QR 사진 또는 읽힌 원문, 해당 기기에 표시된 기기번호의 대응을 확인해야 합니다. 원문이 불투명 토큰이면 업체 규격이나 조회 연동이 필요할 수 있습니다. DB의 `qrRuleMetadata` 필드만 채워도 Parser가 자동 등록되는 구현은 아닙니다. 신고 화면의 **읽은 QR 원문 확인**에서 원문을 확인할 수 있고, 미확인 결과라면 업체를 선택하고 기기번호를 직접 입력합니다.

```text
QRScanner → POST /api/qr/parse → QRController → QRParsingService
                                              ├─ OperatorMatcher → 검증된 업체 Parser
                                              └─ GenericQRParser → 미확인 → 업체·기기번호 직접 입력
```

원문이 URL처럼 보인다는 이유만으로 업체·기기번호를 단정하지 않습니다. QR 내용을 실행하거나 해당 URL로 이동·외부 요청하지 않습니다. Parser가 없거나 여러 규칙이 겹치거나 Parser가 실패하면 원문을 그대로 보존한 미확인 결과로 반환합니다. QR 단계는 업체와 기기번호를 모두 채워야 통과하며 확인 체크박스는 없습니다.

요청은 `{ "rawQr": "읽은 원문" }` 형태이며 1~4096자, 공백만 있는 문자열·NUL·추가 필드는 허용하지 않습니다. 앞뒤 공백을 임의로 제거하지 않습니다. 허용 Origin·JSON 검증과 IP당 분당 30회 요청 제한을 적용합니다. 초과 시 기존 오류 형식의 `429 TOO_MANY_REQUESTS`를 반환하고 화면은 직접 입력을 안내합니다.

현재 미확인 결과 예시는 다음과 같습니다. 지원하는 업체 Parser가 일치하면 `matched: true`, `source: "registered-parser"`, `reason: null`, 내부 `operatorId`와 화면용 `operatorName`을 반환합니다. 지쿠는 업체만 확인했으므로 `deviceId: null`입니다.

```json
{
  "data": {
    "rawQr": "읽은 원문",
    "operatorId": null,
    "operatorName": null,
    "deviceId": null,
    "parserId": "generic-unknown",
    "matched": false,
    "source": "unknown",
    "reason": "UNVERIFIED_QR_FORMAT"
  }
}
```

2026-10-16 업체 QR 변경 검증: Frontend·Backend lint와 TypeScript 검사, Backend 단위/API **101개**, 브라우저 전체 **26개**를 통과했습니다. 새 브라우저 검사 4개는 실제 QR 이미지 해독·업체 표시명·번호 입력·확인·수정·재스캔 초기화를 검증합니다. 추가 QR fixture는 확인된 형식에 테스트용 식별자를 넣어 생성했으며 사용자 사진과 공개 실물 사진은 배포하지 않습니다.

### 14. Amazon Bedrock 현장 사진 판별 구조

신고 사진 단계에서 `POST /api/reports/validate-photos`로 1~2장을 보내면, 서버가 형식을 검증하고 방향 보정·EXIF 제거 후 JPEG로 바꿉니다. `bedrock` 모드에서만 사진 내용도 판별합니다. 이때 Bedrock용 사본은 긴 변 최대 1,600px·3MiB 이하로 다시 줄여 [Converse 이미지 블록](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)에 넣습니다. [Converse의 이미지당 한도](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Message.html)는 3.75MB·8000px입니다. `us-east-1`의 이미지 입력을 지원하는 Claude Haiku 4.5 US 추론 프로필을 사용하도록 준비했습니다. 원본 파일명·전화번호·QR 원문·좌표는 모델 요청에 넣지 않습니다.

`bedrock` 모드에서 모델은 실제 공유 킥보드·자전거가 사진의 주된 대상으로 식별되는지 판별합니다. QR판만 보이거나 기기 없이 주차 장소만 보이는 사진은 충분한 증거로 보지 않습니다. 한 장이라도 명확히 무관하거나 모두 판별할 수 없으면 422 오류로 사진 교체를 안내합니다. 권한 오류·시간 초과·잘못된 응답은 503 오류로 안내하고 다음 단계와 신규 접수를 막습니다. 사진을 바꾸면 이전 확인 결과를 버리고 다시 검사하며, 최종 `POST /api/reports`에서도 서버가 같은 판별을 수행해 사전 확인 API를 우회할 수 없게 합니다. `disabled` 모드에서는 모델을 호출하지 않고 형식 검사 후 접수합니다. 새 접수에는 업체·기기번호가 모두 필요합니다.

선택한 신고 유형은 서버가 보관용 `finalReportText`로 요약하고 선택적 추가 설명은 별도 필드에 저장합니다. 별도의 신고문 작성·생성·확인 단계는 5단계 화면에 없습니다. Phase 3에서 만든 `/api/ai/generate-report`와 텍스트 전용 `ReportTextGenerator`는 기존 코드에 남아 있지만 현재 신고 화면에서 호출하지 않습니다. 운영 `AI_PROVIDER=litellm`은 서버 전용 프록시 키로 사진을 판별하며 외부 HTTPS 사전 검사에서 관련 사진 허용·무관 사진 거부를 확인했습니다. 최종 신고 흐름은 아직 검증하지 않았습니다. 직접 `bedrock` 대안을 선택한다면 연결된 EC2 역할의 추론 프로필·목적지 모델에 대한 `bedrock:InvokeModel` 유효 권한과 Anthropic 모델 접근을 별도 확인해야 합니다. 운영 EC2의 역할은 S3 용도로 연결됐지만 직접 Bedrock 이미지 호출은 검증되지 않았습니다.

### 15. 전화번호 기반 처리결과 조회 구조

신고 시 전화번호는 선택이며, 결과 조회에는 신고할 때 남긴 전화번호만 입력합니다. 인증번호 발송·입력, 본인확인, 시민 로그인은 사용하지 않습니다. 번호 없이 접수한 신고는 전화번호 조회에 포함되지 않습니다.

```text
신고 때 남긴 전화번호 입력 → POST 본문의 번호 형식 확인·정규화
→ 서버 HMAC 검색값 생성 → 같은 번호의 신고 목록·진행 상태
→ 선택한 신고번호와 같은 전화번호로 공개 처리 상세 조회
```

목록은 `POST /api/reports/lookup`에 `{ "phone": "01000000000", "page": 1 }`를 보냅니다. `page`는 생략 시 1이며 1~1000의 정수만 허용합니다. 응답은 `{ data: { items, page, pageSize: 20, hasMore } }`이고 최신 접수부터 페이지당 최대 20건을 반환합니다. 상세는 `POST /api/reports/lookup/:publicId`에 `{ "phone": "01000000000" }`만 보내며 `{ data: { ...summary, history } }`를 반환합니다. 일치하는 목록이 없으면 빈 배열, 번호와 상세 신고가 일치하지 않으면 404를 반환합니다.

원문 번호는 JSON 본문으로만 전송하고 URL·쿼리 문자열·라우트 상태·`localStorage`·`sessionStorage`·로그에 넣지 않습니다. 목록과 상세를 감싸는 메모리 Context에서만 번호와 결과를 유지합니다. 입력 번호를 바꾸면 이전 결과를 즉시 지우고 진행 요청을 취소하며 늦게 도착한 이전 응답도 무시합니다. 조회 화면을 나가거나 새로고침·직접 상세 접근으로 번호가 없으면 다시 입력하도록 안내합니다. 별도 인증 세션이나 조회코드를 요구하지 않습니다.

서버는 입력 번호를 정규화한 뒤 서버 키로 HMAC을 계산하고 키 버전과 함께 검색합니다. 빈 번호·잘못된 형식은 거부하며, 빈 식별자로 검색하거나 번호 조건을 생략하지 않습니다. 상세는 `publicId`와 번호가 모두 일치해야 반환하며, 일치하지 않는 번호를 신고에 새로 연결하지 않습니다.

**전화번호는 검색 조건이며 본인확인 수단이 아닙니다. 해당 번호를 아는 다른 사람도 같은 조회를 할 수 있습니다.** 공개 summary는 `publicId`, `createdAt`, `operatorName`, `categories`, `status`, `completionMethod`, `completedAt`만 포함합니다. 상세의 `history`는 오래된 순서로 `status`, `createdAt`, `completionMethod`, `publicNote`만 제공합니다. 신고 본문·사진·GPS·주소·전화번호 원문/암호문/HMAC·관리자 내부 메모는 반환하지 않으며 Repository부터 필요한 공개 열만 선택합니다.

두 조회 엔드포인트는 **같은 IP에 대해 합산 분당 20회** 제한을 공유하며 초과 시 429를 반환합니다. `Cache-Control: no-store`를 적용하고 DB 미연결·장애는 503으로 안내합니다. 이러한 제한은 본인확인을 대신하지 않습니다. 목록·상세·빈 결과·오류·페이지 이동·수거/견인 완료 방식·공개 처리 이력을 구현했고 EC2 HTTPS에서 신고 후 목록·상세 조회까지 검증했습니다. 전화번호 없는 신고의 별도 조회코드는 현재 범위에 포함하지 않습니다.

### 16. 관리자 로그인·인증 구조

관리자만 로그인합니다. 인증되지 않은 `/admin/dashboard` 접근은 `/admin/login`으로 이동하고 서버 관리자 API도 세션을 검사합니다.

Phase 1 개발 인증은 환경변수로 선택한 계정, scrypt 비밀번호 해시, 서버 메모리 세션, HttpOnly 쿠키를 사용합니다. 로그인 요청 제한과 허용 Origin 확인을 적용합니다. 서버 재시작 시 세션이 유지되지 않습니다.

세션 쿠키는 `SameSite=Strict`, `/api/admin` 범위와 8시간 유효기간을 사용하며 HTTPS에서는 `Secure` 속성을 적용합니다. 로컬 HTTP 개발에만 예외를 둡니다. 256비트 무작위 세션 토큰의 해시를 서버에 보관합니다.

현재 수정본은 `Admin` 테이블과 영속 세션 저장소를 연결하며 인증 응답의 `mode`를 `database`로 반환합니다. 비운영 환경에서 개발 계정을 명시적으로 활성화하면 `development-mock`을 우선 사용하고, 그 외에는 `DATABASE_URL`이 있을 때 DB 인증을 사용합니다. 실제 DB에 저장된 scrypt 비밀번호 해시를 검사하며 로그인 요청으로 계정을 생성하지 않습니다.

DB에는 토큰 원문 대신 SHA-256 해시를 저장하고 요청마다 만료·해지 여부, 계정 활성 상태와 역할·테넌트 값을 확인합니다. 로그아웃은 DB의 세션 해지를 기다린 뒤 완료하며 재로그인은 이전 토큰을 해지하고 새 토큰을 발급합니다. DB 오류는 내부 내용 없는 `503 ADMIN_AUTH_UNAVAILABLE`로 응답합니다. 플랫폼 관리자 최초 등록 CLI는 표준입력으로 전달받은 계정을 한 번 등록하고 기존 계정을 임의로 덮어쓰지 않습니다. 프론트엔드는 서버 쿠키로 세션을 복원하고 역할에 맞는 표시를 사용하며, 클라이언트 `localStorage`의 역할 플래그를 인증 근거로 사용하지 않습니다. 통합 검증·EC2 반영과 실제 로그인·새로고침·로그아웃 검증을 완료했습니다.

아래 역할에 따른 실제 신고 데이터 접근 통제를 구현하고 로컬 검증과 **EC2 배포·실제 HTTPS 검증을 완료했습니다.** 데이터 소유권 Schema와 테넌트·지역 간 DB 제약은 Phase 4에서 적용했습니다. 현재 범위는 세션의 `tenantId`에 따른 접근 통제이며 실제 지자체·담당 지역 등록과 계정 생성 UI는 남아 있습니다.

| 역할 | 허용 범위 |
| --- | --- |
| `PLATFORM_ADMIN` | 모든 테넌트의 신고 조회·관리; 테넌트 계정 생성·담당 지역 관리 UI는 후속 구현 |
| `TENANT_ADMIN` | 서버에 등록된 자신의 `tenantId`에 속하는 신고만 조회·관리 |

대시보드 집계·신고 목록·상세·상태 변경·메모·비공개 사진 조회에서 Backend가 세션의 역할·소속으로 범위를 강제합니다. 다른 테넌트의 신고 ID를 직접 요청하는 경우도 차단합니다. 운영의 DB `PLATFORM_ADMIN` 계정과 로컬의 개발 Mock 계정은 구분하며, 개발 Mock 인증만으로 실제 DB 신고 관리 권한을 얻지 않습니다. 관리자 지도는 같은 서버 권한 범위를 적용하며 구현·로컬 검증을 완료했습니다. 통계·내보내기는 아직 제공하지 않습니다.

#### 수거·견인 완료 처리 — 구현·로컬·EC2 검증 완료

관리자는 신고 상세에서 실제 수거·견인이 끝난 것을 확인한 뒤 **수거 완료** 또는 **견인 완료**를 선택합니다. 완료 방식과 선택 사항인 내부 메모·신고자 공개 처리 내용을 확인하고 저장하면 목록·상세에 처리완료 상태와 완료 방식을 표시합니다. 이미 현장 조치가 끝난 신고는 접수 상태에서도 바로 완료할 수 있도록 설계하며, 완료 후 재개방·완료 방식 수정은 별도 기능으로 정의하기 전까지 허용하지 않습니다.

| 저장 항목 | 처리 원칙 |
| --- | --- |
| `status` | 완료 처리 시 `COMPLETED` |
| `completionMethod` | `COLLECTED`(수거) 또는 `TOWED`(견인) 필수 선택 |
| `completedByAdminId` | 요청 본문이 아닌 인증된 서버 세션의 관리자 ID; 완료 등록자를 의미 |
| `completedAt` | 서버에서 기록한 완료 등록 시각; 실제 현장 작업 시각으로 추정하지 않음 |
| `internalNote` / `publicNote` | 기존 이력의 메모 필드 사용; 신고자 조회에는 공개 처리 내용만 반환 |
| 처리 이력 | 이전·새 상태, 완료 방식, 관리자, 동일한 등록 시각을 보존 |

Backend는 먼저 세션의 테넌트로 신고 접근 범위를 제한합니다. `TENANT_ADMIN`은 소속 테넌트 신고만 완료할 수 있고 `PLATFORM_ADMIN`은 전체 신고를 처리할 수 있습니다. 요청의 관리자·테넌트 ID를 권한 근거로 사용하지 않습니다.

신고 갱신과 이력 추가는 하나의 DB 트랜잭션으로 처리하고, 현재 상태를 조건으로 갱신하여 동시 완료 요청이 이력을 중복 생성하지 않도록 합니다. 동일한 완료 요청을 다시 보내면 기존 결과를 반환하고 완료 시각을 바꾸지 않습니다. 이미 완료된 내용을 다른 값으로 덮어쓰려는 요청은 충돌로 처리합니다. Phase 6에서는 정상 수거·견인 완료, 미인증·다른 지역 접근 거부, 필수값 누락, 중복·동시 요청과 트랜잭션 실패를 검증합니다.

같은 킥보드가 여러 번 신고되어도 접수번호·사진·연락처·이력은 각각 보존합니다. 관리자 상세의 **같은 기기 신고 함께 처리**에서 현재 신고와 같은 테넌트·지역·등록 업체·기기번호의 미완료 신고 중 현재 신고 기준 **100m 이내·접수 시각 전후 24시간**인 후보를 보여줍니다. 번호 비교는 공백 제거·영문 대문자화만 적용하고 앞의 0과 구두점은 구분합니다. 중간에 같은 기기의 완료 기록이 있으면 이후 접수를 새 사건으로 분리합니다. 업체·번호가 미확인이면 자동 후보를 제시하지 않으며, 지역 내 조회 한도를 넘으면 개별 처리를 안내합니다.

후보는 기본 선택하지 않습니다. 관리자가 관련 신고를 체크하고 현재 신고를 포함한 접수번호·건수·수거/견인 방식·공개/내부 메모를 확인해야 함께 완료됩니다. 최대 100건을 한 트랜잭션으로 변경하고 신고별 이력을 남깁니다. 하나라도 다른 관리자가 변경했거나 조건을 벗어나면 전체 처리를 취소하고 새로 조회하게 합니다. 동일한 요청 재시도는 기존 완료 결과를 반환합니다. 시민 조회에는 각 신고의 완료 상태와 공개 메모만 표시합니다. 기존 개별 처리도 사용할 수 있습니다.

처리중 전환·수거 완료·견인 완료 버튼, 완료 정보·공개/내부 메모 저장과 상태 이력 API를 구현하고 로컬 검증을 완료했습니다. 새 수정본을 EC2에 배포해 실제 수거·견인 완료와 공개 처리 결과 조회까지 검증했습니다. 시민의 신규 신고 저장은 Phase 4에서 별도로 동작합니다.

### 17. AWS 구성

현재 운영 구성은 **EC2 한 대에서 Frontend·Backend·PostgreSQL을 실행하고, 증빙사진은 비공개 S3에 저장**하는 방식입니다. 설정은 EC2의 `/etc/parkick/backend.env`로 관리합니다. [EC2 배포·S3 이전 절차](deploy/README.md)에 상태를 기록했으며 개발 PC는 `local` 저장을 사용합니다. 이전 사진의 로컬 원본은 복구용으로 유지합니다.

| 역할 | 현재 운영 구성 |
| --- | --- |
| Frontend | EC2의 Nginx에서 빌드된 정적 파일 제공, HTTPS |
| Backend | 같은 EC2에서 Node API 실행, Nginx를 통해 접근 |
| DB | 같은 EC2에서 PostgreSQL 실행, DB 포트는 외부에 공개하지 않음 |
| 증빙사진 | 서울 리전 비공개 S3 `sgu-202686-s3/reports/`에 저장, DB에는 객체 키와 사진 메타데이터 저장; EC2 로컬 원본은 복구용 보존 |
| AI | 운영 사진 판별은 `AI_PROVIDER=litellm`과 내부 HTTPS 프록시 사용. 이전 텍스트 신고문 생성기는 비활성화; 직접 Bedrock 호출 대안은 EC2 모델 권한 검증 전 |
| 설정 | EC2의 `/etc/parkick/backend.env`; S3 저장은 연결된 인스턴스 프로필 사용, `disabled` 모드의 형식 검사에는 Bedrock 권한이 불필요 |

신고 DB와 연락처 키는 EC2의 지속 볼륨, 활성 사진은 S3에 저장하며 함께 보존·백업해야 합니다. 복구용 사진 원본 폴더는 `parkick` 계정 전용 `0700` 권한이며 Nginx 정적 파일 경로에 포함하지 않습니다. 관리자 인증·테넌트 범위를 검사하는 비공개 사진 조회 API는 이전 로컬 저장 릴리스에서 실제 HTTPS 검증을 완료했고, S3 전환 후 브라우저 화면 검증은 별도 남았습니다. RDS·ECS·CloudFront·Secrets Manager·Parameter Store는 현재 배포 구성에 포함하지 않습니다.

2026-10-15에 서울 리전의 EC2·비공개 S3를 생성하고 개발 PC에서 실제 S3 연결을 확인했습니다. 초기 EC2 웹·API·PostgreSQL·비공개 로컬 사진 폴더·IP HTTPS 배포 당시 신고 흐름과 갱신 검사를 통과했습니다. 2026-10-23 기존 IAM 인스턴스 프로필을 연결하고 S3 권한을 확인해 운영 사진 저장을 S3로 전환했으며 기존 6장을 이전했습니다. 이후 LiteLLM 프록시를 운영 사진 판별에 연결하고 외부 HTTPS에서 관련 공유 킥보드 사진 200·무관 JPEG 422를 확인했습니다. 최종 신고 제출은 아직 검증하지 않았습니다. S3 공개 차단을 유지하며 AWS 자격증명과 프록시 키는 Frontend에 두지 않습니다.

### 18. 개인정보 및 보안 설계

- 연락처 입력은 선택이며 미입력 신고도 접수합니다. 번호를 남긴 경우에만 저장하며 전체 번호를 로그·접수 응답에 노출하지 않습니다. 마스킹 값을 DB에 저장하며 새 관리자 상세에서도 사용합니다. 해당 수정본은 EC2 배포·실제 HTTPS 검증을 완료했습니다.
- 연락처는 AES-256-GCM으로 암호화하고 별도 키의 HMAC-SHA-256 조회 식별자를 저장합니다. 두 키는 서버 `.env`에서 관리하며 각각 base64 형식의 32바이트여야 합니다. 키 회전·재암호화는 후속 운영 작업입니다.
- 전화번호 수집·이용 동의는 번호를 입력한 경우에만 필요하며 동의 버전·시각을 함께 저장합니다. 미입력 시 해당 동의는 요구하거나 기록하지 않습니다. 보유기간·제3자 제공·실제 법적 안내문은 운영 전에 검토하며 MVP에서 확정하지 않습니다.
- 제출 전 사진은 브라우저에서 최대 2,560px로 축소·JPEG 품질 0.85로 압축한 뒤 UUID 파일명으로 메모리에서 관리합니다. 원본 제한은 장당 10MiB·40메가픽셀이며 작은 파일은 확대하지 않습니다. 사진 준비 실패는 사용자에게 표시하고, 여러 장 중 실패가 있으면 기존 사진을 보존합니다. 화면 이탈 시 변환을 취소하고 임시 URL을 정리합니다. 서버는 JPEG/PNG/WebP 1~2장·각 10MiB 이하를 MIME·확장자·시그니처·실제 디코딩으로 다시 검증합니다. 정지 사진만 허용하고 40메가픽셀을 넘는 입력은 거부합니다.
- 사진은 서버에서 방향 보정·배경 처리·EXIF 등 메타데이터 제거 후 JPEG로 재인코딩하고, 정제 결과도 10MiB 이하인지 확인합니다. 현재 운영에서는 S3에 비공개 저장하고 DB에 객체 키를 기록합니다. EC2 역할의 S3 임시 객체 업로드·조회·삭제, 기존 6장 이전·조회는 검증했으며 신규 신고의 실제 브라우저 제출은 아직 확인하지 않았습니다. 이전 로컬 원본은 공개 정적 경로 밖에 보존합니다.
- 운영 LiteLLM 경로에서는 정제·축소된 현장 JPEG를 서버에서 HTTPS 프록시로 보냅니다. 직접 Bedrock 대안을 활성화하면 `us-east-1`의 US Claude Haiku 4.5 추론 프로필을 사용하며, 대상은 미국 내 `us-east-1`·`us-east-2`·`us-west-2`입니다. 전화번호·QR 원문·좌표를 함께 전송하지 않습니다. 운영 EC2 역할은 S3 용도로 연결됐고 직접 Bedrock 모델 호출에는 사용하지 않습니다. 프록시를 거친 Parkick 사전 사진 검사에서 관련·무관 사진의 판정을 확인했으며 최종 신고 흐름은 미검증입니다.
- 관리자 로그인·QR 해석·사진 사전 확인·신고 제출에 요청 제한을 적용하며 사진 확인과 제출은 각각 IP별 분당 10회입니다. 전화번호 목록·상세 조회는 같은 IP에 대한 분당 20회 제한을 공유하고 응답을 캐시하지 않습니다. 허용 Origin 검사·본문 제한·Zod 검증·일관된 오류 처리를 적용하며 초기 EC2에 IP HTTPS를 활성화했습니다.
- `VITE_*` 값은 브라우저에 공개됩니다. AWS 키, DB URL, 세션 키, 연락처 암호화·검색 키 등은 절대로 넣지 않습니다. 공개용 지도 키도 공급자의 도메인 제한을 설정해야 합니다.
- 연구용 내보내기에는 연락처·정확한 위치·원본 사진·QR 식별정보를 그대로 포함하지 않습니다. 실제 측정하지 않은 연구 수치는 만들지 않습니다.

### 19. 단계별 구현 계획

| 단계 | 범위 |
| --- | --- |
| Phase 0 · 완료 | docs·asset·page·기존 코드·환경 분석 |
| Phase 1 · 완료 | 기반 프로젝트·브랜딩·기본 라우팅·화면 골격·Schema·Provider 계약·검증 |
| Phase 2 · 완료 | QR 카메라·수동 업체 확인·사진·GPS/좌표·유형·신고 Wizard, NAVER 어댑터; 실제 업체 규격·지도키 실증은 외부 준비 후 |
| Phase 3 · 과거 구현 | 텍스트 신고문 생성·재생성·수정 API와 개발 Mock을 만들었으나 새 5단계 신고 화면에서는 사용하지 않음; Bedrock 사진 판별의 실제 AWS 실증은 대기 |
| **Phase 4 · 구현 / S3 운영 전환** | **PostgreSQL·Prisma·Migration·seed, 테넌트/지역 소유권·연락처·완료 필드 제약, 비공개 사진 정제·S3 저장, 선택 연락처·동의·신고번호·중복 제출 방지; EC2 역할의 S3 쓰기·읽기·삭제와 기존 사진 6장 이전·검증 완료** |
| **Phase 5 · 구현·배포 검증 완료** | **인증 없는 전화번호 기반 실제 목록·상세·처리 이력 조회, 공개 필드 제한, 20건 페이지 이동·분당 20회 공유 제한·no-store·메모리 전용 조회 상태; 로컬 검사와 EC2 HTTPS의 신고→조회 브라우저 검증 통과** |
| **Phase 6 · 진행 중** | **DB 관리자 로그인·영속 세션·최초 등록은 EC2 검증 완료. DB 대시보드·목록·상세·비공개 사진·서버 권한 격리·처리중/수거/견인·메모·이력은 구현·로컬·EC2 검증 완료. 테넌트 계정 생성 UI·실제 담당 지역 등록은 미구현** |
| Phase 7 · 진행 중 | 관리자 실제 좌표 지도·동일 위치 묶음·요약/상세 이동·상태/검색·페이지는 구현·로컬·EC2 실제 SDK 검증 완료. 업체/지역/유형/기간 통계는 미구현 |
| Phase 8 · 진행 중 | EC2 웹·API·PostgreSQL·IP HTTPS 초기 배포와 비공개 S3 사진 전환 완료; 과거 외부 API 접수·재시도·모바일 Chrome 초기 흐름·갱신 검사 완료, S3 전환 후 브라우저 사진 조회·신규 신고 검증 필요 |
| Phase 9 | 사진 관련성 판별 품질·모델 비교와 연구 기록 실험 |

기존 문서에는 10월 8~10일 구조, 11~14일 신고, 15~17일 관리자, 18~20일 AI, 21~23일 통계, 24~26일 실험, 27~28일 안정화·논문 일정이 있습니다. 이는 기존 계획의 목표 일정이며 최신 Phase 순서와 변경된 연구 범위에 맞춰 다시 조정해야 합니다. 일정 때문에 현재 제외된 기능을 자동으로 구현하지 않습니다.

### 20. 구현 전에 결정할 사항

Phase 2의 QR 디코딩·수동 입력·사진·GPS 흐름은 외부 계정 없이 사용할 수 있습니다. 실제 업체 자동 확인·NAVER 실증과 후속 서비스를 연결하기 전에 아래 항목을 확정합니다.

| 결정 | 필요한 시점 |
| --- | --- |
| 검증된 운영업체 목록·QR 샘플·식별 규격 | 카카오·빔·지쿠의 확인된 형식 등록; 일레클·알파카·스윙 및 다른 형식은 추가 자료 필요 |
| NAVER Maps Client ID·SDK 도메인 등록·실제 지도/주소 조회 검증 | Phase 2 어댑터 실증·Phase 7 |
| Bedrock 계정·Region·이미지 지원 Model ID·모델 권한·EC2 역할 | 사진 내용 관련성 판별을 활성화하기 전 필수 검증; `disabled` 모드의 5단계 배포에는 불필요 |
| 운영 PostgreSQL·DB 계정·백업·배포 Migration 절차 | 로컬 개발 DB는 구현; 운영 전 확정 |
| 도입 지자체·관할 경계·좌표 기반 신고 배정·미도입 지역 정책 | 실제 지자체 도입 전; 현재 `local-development` 배정만 사용 |
| S3 사진·EC2 DB·암호화 키 백업과 고아 객체 정리 정책 | S3 전환 직전 백업 및 기존 사진 이전 완료; 정기 백업·복구 검증과 고아 객체 정리는 후속 운영 과제 |
| 연락처 키 회전·재암호화·동의 문구·보유기간 | 운영 전; 현재 서로 다른 로컬 암호화·HMAC 키 사용 |
| 전화번호 조회 공개 필드·요청 횟수·페이지 크기 제한 | Phase 5에서 공개 필드·IP 합산 분당 20회·페이지당 20건으로 구현 |
| 플랫폼·테넌트 계정 생성·담당 지역·서버 권한·세션 저장소·메모 공개 범위 | Phase 6 진행 중; DB 로그인은 EC2 검증 완료, 신고 관리·서버 권한·공개/내부 메모는 로컬·EC2 검증 완료. 테넌트 계정 생성 UI·실제 관할 등록은 후속 구현 |
| AWS 비용·네트워크·모니터링·도메인·배포 책임 | Phase 8 |
| 연구 데이터 이용 범위·익명화·실험 조건 | Phase 9 |

## 환경변수와 외부 서비스 설정

앱별 `.env.example`을 기준으로 설정합니다. 실 Secret은 예제 파일이나 Git에 커밋하지 않습니다.

| 변수 | 위치·목적 | 현재 상태 |
| --- | --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | Backend 실행환경·수신 주소 | 사용 |
| `FRONTEND_ORIGIN` | 허용 Frontend Origin | 사용 |
| `TRUST_PROXY` | 프록시 신뢰 범위 | 기본 `false`; 같은 EC2의 Nginx 사용 시 `loopback` |
| `ENABLE_DEV_ADMIN` | 개발 관리자 인증 활성화 | 선택, 기본 false |
| `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `DEV_ADMIN_NAME` | 로컬 개발 관리자 | 활성화 시 필요 |
| `API_PROXY_TARGET` | Frontend 개발 프록시의 서버 주소 | 로컬 Backend에 맞춤 |
| `VITE_API_BASE_URL` | 브라우저 API 경로, 기본 `/api` | 사용 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 실제 신고 저장에 사용; 빈 값이면 저장 비활성화 |
| `REPORT_STORAGE_PROVIDER` | `local` / `s3` 사진 저장 선택 | 개발 PC는 `local`, 운영 EC2는 `s3` |
| `REPORT_STORAGE_DIR` | 서버 비공개 사진 폴더 | 개발 기본 `backend/data/reports`; 운영 `/var/lib/parkick/reports`는 이전 원본의 복구·호환용으로 유지 |
| `REPORT_REGION_CODE` | 서버가 신규 신고에 배정할 지역 코드 | 사용; 기본 `local-development`, 실제 관할 판별 기능 아님 |
| `AI_PROVIDER` | `mock` / `bedrock` / `disabled` 선택 | 사용; 개발·테스트 기본 mock, 운영 기본 disabled |
| `AWS_PROFILE` | 로컬 AWS 로그인 프로파일 선택 | 개발 PC의 `parkick`에서 사용; 운영 EC2는 프로필 파일 대신 연결된 IAM 역할 사용 |
| `AWS_REGION` | S3 리전·Bedrock 기본 리전 | `s3`에 필수; `BEDROCK_REGION`이 비어 있으면 AI에도 사용 |
| `BEDROCK_REGION` | AI 전용 AWS 리전 | 선택; 예: `us-east-1`. 지정하면 AI 호출에서 `AWS_REGION`보다 우선 |
| `BEDROCK_REPORT_MODEL_ID` | 이미지 지원 Bedrock 모델·추론 프로필 | `bedrock` 모드에 필수; Haiku 4.5 US 프로필 예시는 실제 이미지 호출 검증 전 |
| `S3_REPORT_BUCKET`, `S3_REPORT_PREFIX` | 비공개 사진 버킷·객체 경로 접두사 | 운영 EC2에 `sgu-202686-s3`·`reports` 적용, 실제 S3 검사·기존 사진 이전 통과 |
| `VITE_NAVER_MAP_CLIENT_ID` | Frontend NAVER Maps 공개 Client ID | 선택; 비어 있으면 SDK를 로드하지 않고 GPS·수동 좌표 사용 |
| `PHONE_ENCRYPTION_KEY`, `PHONE_LOOKUP_HMAC_KEY` | 서버 연락처 암호화·검색 키 | DB 사용 시 필수; 서로 다른 base64 32바이트 키, `setup:local`이 빈 값만 생성 |

### 관리자 신고 지도

관리자 로그인 후 대시보드의 **신고 지도**를 사용하거나 메뉴의 **신고 지도**로 `/admin/map`을 엽니다. DB에 저장된 실제 좌표를 사용하며, 현재 확대 수준에서 화면상 가까운 신고를 하나의 숫자로 묶습니다. 묶음 마커를 누르면 확대되어 서로 다른 위치가 나뉘고, 축소하면 다시 합쳐집니다. 개별 마커에서는 신고번호·상태·업체/기기·주소·접수 시각과 **신고 상세 보기**를 확인합니다. 좌표가 완전히 같거나 최대 확대에서도 겹치는 신고는 목록으로 모두 조회합니다. 처리 상태·검색어로 범위를 좁히고 200건씩 이전/다음 페이지를 조회합니다. 묶음 건수는 현재 페이지의 표시 대상 기준이며 플랫폼 관리자는 전체 신고, 테넌트 관리자는 자신의 소속 신고만 서버에서 반환합니다.

지도는 저장된 좌표를 사용하므로 Reverse Geocoding 성공 여부와 무관하게 표시하며, 관리자 지도에서 주소 자동 조회를 호출하지 않습니다. 지도 키 미설정·연결 실패 시 상태를 안내하고 신고 목록을 이용할 수 있습니다.

2026-10-16 수정본은 Backend 단위/API **92개**, 실제 PostgreSQL 통합 **22개**, 관리자 지도 브라우저 **2개**, 기존 관리자 회귀 **2개**를 통과했습니다. 지도 브라우저 검사는 실제 DB·로그인·지도 API를 사용하고 NAVER SDK만 대역 처리하여 동일 위치 묶음·요약/상세 이동·악성 문자열의 안전한 표시·상태/검색·모바일 폭·주소 조회 0회를 확인했습니다. **관리자 지도 수정본의 EC2 배포·실제 NAVER SDK 검증을 완료했습니다.** 2026-10-16 11:56:15.142 KST(02:56:15.142Z)에 실제 NAVER SDK와 합성 신고 3건으로 좌표 마커·동일 위치 묶음·마커 클릭 요약·상세 이동·상태 필터·모바일 화면을 검증했습니다. 관리자 지도에서 Reverse Geocoding 호출이 없음을 확인했습니다. 검증 후 UUID·표식·내용·시각·해시가 일치하는 테스트 신고 3건과 관계 데이터·사진만 정리했으며 기존 신고·관리자를 보존했습니다.

2026-10-16 **17:22:49 KST(08:22:49Z)**에 근접 신고 묶음을 EC2에 배포했습니다. 화면 좌표 간 56px 기준으로 건수를 합치고 확대·축소·크기 변경 시 다시 계산하며 저장 좌표는 바꾸지 않습니다. Frontend lint·빌드, 단위 검사 10개(클러스터 6개 포함), 실제 로컬 DB를 사용하는 관리자 지도 브라우저 검사 3개와 EC2 전체 빌드를 통과했습니다. **17:23:37 KST** 실제 NAVER SDK에서 기존 신고의 표시 합계, 브라우저 안에만 표시한 합성 자료의 근접 묶음→클릭 확대·분리→모아보기, 동일 좌표·최대 확대의 전체 목록을 확인했습니다. 운영 테스트 신고 생성·주소 조회·브라우저 오류는 없었습니다.

### NAVER 지도 설정

지도 공급자는 2026-10-09 사용자 선택에 따라 **네이버 지도**로 변경했습니다. [NAVER 공식 인증 안내](https://navermaps.github.io/maps.js.ncp/docs/tutorial-1-Getting-Client-ID.html)에 따라 네이버 클라우드 콘솔의 **Services → Application Services → Maps → Application**에서 앱을 등록하고 **Client ID**를 확인합니다. 지도 표시용 **Dynamic Map**을 활성화하고, [Geocoder 설정 안내](https://navermaps.github.io/maps.js.ncp/docs/module-geocoder.html)에 따라 **Reverse Geocoding** 선택도 확인합니다. 신고 위치 단계는 좌표를 주소로 바꾸는 Reverse Geocoding을 호출하며 관리자 신고 지도는 저장된 좌표만 사용합니다.

앱의 **Web 서비스 URL**에 운영 주소 `https://15.165.235.154`와 개발 주소 `http://localhost:5173` 등 실제 접속 주소를 등록하고, **frontend/.env**에 다음 값을 설정합니다. Client Secret은 브라우저에 넣지 않습니다.

```dotenv
VITE_NAVER_MAP_CLIENT_ID=발급받은_Client_ID
```

로컬에서는 `.env` 변경 후 Frontend 개발 서버를 재시작합니다. `VITE_NAVER_MAP_CLIENT_ID`는 빌드 시 정적 파일에 포함되므로 운영에서는 Frontend를 다시 빌드·배포해야 합니다. 신고 위치 단계는 `https://oapi.map.naver.com/openapi/v3/maps.js`에 `ncpKeyId`와 `submodules=geocoder`를 전달해 SDK를 로드합니다. 진입 시 기기 GPS를 자동 요청하고, 좌표가 확인되면 이동 가능한 지도 핀과 조회한 주소를 표시합니다. 수동 좌표 입력은 GPS 또는 지도 오류 시에만 나타납니다. [공식 Geocoder 사용법](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Geocoder-Geocoding.html)을 기준으로 도로명 주소를 우선하고 지번 주소를 대체값으로 사용합니다.

같은 Client ID에서 콘솔의 서비스 선택·Web 서비스 URL만 변경한 경우 재빌드는 필요하지 않습니다. Client ID 자체를 변경한 경우에는 Frontend를 다시 빌드·배포합니다.

Client ID가 비어 있으면 SDK·주소 조회 요청 없이 GPS·수동 좌표로 계속 진행합니다. 잘못된 ID·서비스 URL·네트워크 문제로 연결이 실패해도 수동 입력을 유지합니다. 기존 `VITE_KAKAO_MAP_APP_KEY`는 더 이상 사용하지 않습니다.

2026-10-16 `frontend/.env`의 공개 Client ID 설정을 확인하고 **11:16:06 KST에 Frontend만 배포했습니다.** 서버 `frontend/.env.production`의 공개 설정 두 개(`VITE_API_BASE_URL`, `VITE_NAVER_MAP_CLIENT_ID`)를 보존하며 Backend·DB는 재시작하지 않았습니다. **실제 HTTPS 모바일 브라우저에서 SDK 200·지도 표시·타일 9개 로드를 확인했습니다.** 자동 주소 조회는 HTTP 403으로 실패해 아직 완료되지 않았으며, 해당 애플리케이션의 Reverse Geocoding 사용 설정과 권한을 확인해야 합니다. 지도 인증 실패 callback·브라우저 오류는 없었고 실제 GPS 요청이나 신고 제출 없이 고정 테스트 좌표만 사용했습니다. `test:map`은 SDK 대역으로 상호작용과 실패 처리를 검사하며, 실제 타일·주소 데이터·계정 권한 검증과 별개입니다. 지도 표시·주소 조회를 활성화하면 좌표가 네이버에 전달됩니다.

2026-10-16 **13:32:40 KST(04:32:40Z)**에 주소 조회 개선본을 배포했습니다. 좌표 변경 후 300ms 대기, 실패·시간 초과 후 **주소 다시 조회**, 성공한 동일 좌표·주소로 단계에 재진입할 때 중복 조회 방지 및 확인 상태 유지, 직접 입력한 주소 보호를 구현했습니다. Frontend lint·빌드와 SDK 대역 `test:map` **8개**, Linux 운영 빌드를 통과했습니다. **13:34:13.928 KST(04:34:13.928Z)** 실제 사이트 검증에서 SDK는 200이지만 주소 API는 최초 요청과 수동 재시도 모두 403이었습니다. 재시도 시 좌표 유지·직접 입력은 정상이고 브라우저 오류·실제 GPS 요청·신고 제출은 없었습니다. **실제 자동 주소 조회는 아직 미완료이며 원인은 미확정입니다.** 지도 인증 실패 callback은 없고 요청의 Referer도 운영 주소와 일치했습니다. 콘솔 접근 권한이 없어 사용자가 해당 Application의 **변경 → Reverse Geocoding 선택**과 **Web 서비스 URL `https://15.165.235.154`**를 확인해야 합니다.

2026-10-09 변경 검증: `npm.cmd run lint`, `npm.cmd run build` 통과. 마지막 SDK 오류 처리 수정 후 Frontend 빌드·지도 코드 lint·지도 테스트 TypeScript 검사도 통과했습니다. `npm.cmd run test:e2e` 13개, `npm.cmd run test:map` 5개가 통과했습니다. 지도 테스트에는 핀 이동·좌표/주소 유지·인증 실패 재시도·이전 요청의 늦은 콜백 무시가 포함됩니다. 생성한 `backend/.env`를 실제로 읽어 로컬 테스트 앱의 관리자 로그인 응답 200도 확인했으며, 비밀번호·세션 값은 출력하지 않았습니다.

2026-10-16 **16:12:57 KST(07:12:57Z)**에는 사용자가 변경한 Client ID로 Frontend를 다시 빌드·배포했습니다. 실제 HTTPS 모바일 검사에서 **지도와 타일 9개 표시, SDK 200**을 확인했습니다. 새 ID에서도 주소 API는 **403**이며 최초 요청·수동 재시도 실패 후 직접 입력은 정상입니다. 오류 응답에 상세 사유가 없어 원인은 미확정입니다. 새 ID를 발급한 동일 Application의 Dynamic Map·Reverse Geocoding 선택과 Web 서비스 URL 설정 확인이 필요합니다. Backend·DB 재시작이나 신고 제출은 하지 않았습니다.

### DB 실행·Schema 확인

`npm.cmd run setup:local`이 프로젝트 전용 PostgreSQL 시작, Prisma Client 생성, Migration 적용, 로컬 기관·지역·신고 유형 seed를 한 번에 준비합니다. Docker Compose는 사용하지 않습니다. 반복 실행해도 기존 신고 데이터를 초기화하지 않으며, 이후에는 `db:start`와 `db:stop`으로 DB를 실행·중지합니다. PostgreSQL이 없어도 신고 입력·개발 Mock 사진 판별·개발 관리자 인증은 실행할 수 있지만 최종 제출은 사용할 수 없습니다.

`backend/.env.example`의 `DATABASE_URL`은 비어 있고 `setup:local`이 로컬 값을 채웁니다. Schema 형식 검사는 `npm.cmd run check:schema`로 실행하며 DB 접속 없이 검사합니다. 로컬 DB 설정 없이 Schema만 확인하려면 별도 PowerShell에서 아래 **검사용 가짜 연결 문자열**을 일회성으로 사용할 수 있습니다. 이 예시는 계정·DB를 생성하지 않으며 해당 비밀번호는 실제 자격증명이 아닙니다.

```powershell
Set-Location E:\parkick
$env:DATABASE_URL = 'postgresql://parkick_app:YOUR_DB_PASSWORD@127.0.0.1:5432/parkick'
npm.cmd run check:schema
Remove-Item Env:DATABASE_URL
```

이미 현재 터미널에 실제 `DATABASE_URL`을 설정했다면 위처럼 덮어쓰지 말고 `npm.cmd run check:schema`만 실행합니다. 초기 Migration은 `backend/prisma/migrations/20261015000000_initial/migration.sql`이며, `setup:local`에서 적용합니다. seed는 개발 기관·지역·유형만 만들며 운영 관리자나 가짜 신고를 만들지 않습니다. 운영은 현재 `REPORT_STORAGE_PROVIDER=s3`를 사용하고 HTTPS Origin과 비밀번호 DB 연결도 설정합니다. 초기 EC2 DB·사진 폴더부터 S3 이전까지의 절차는 [배포 안내](deploy/README.md)에 정리했습니다.

### AI·S3·전화번호 조회 설정 상태

EC2 → Bedrock 직접 호출 대안용 [최소 권한 정책](deploy/iam-bedrock-report-policy.json)과 [관리자 적용 안내](deploy/iam-admin-setup.md)를 준비했습니다. 기존 실습의 US Claude Haiku 4.5 프로필을 기준으로 `bedrock:InvokeModel`·`bedrock:GetInferenceProfile`을 제한된 ARN에 허용하며, 모델 대상 리전은 버지니아·오하이오·오리건입니다. EC2 역할은 S3 저장용으로 연결했지만 Bedrock 정책 변경·AI 활성화는 수행하지 않았습니다. 기존 텍스트 전용 연결 검사와 별도로 Claude 이미지 요청용 `aws:check:photo` 스크립트를 준비했으며 실제 호출은 아직 검증하지 않았습니다.

LiteLLM·직접 Bedrock 사진 판별과 S3 저장은 설정으로 선택하는 서버 어댑터를 구현했습니다. 개발 PC와 EC2 역할에서 S3 테스트 객체 저장·조회·삭제를 확인하고, 기존 운영 사진 6장을 S3로 이전해 조회·해시를 검증했습니다. EC2의 local 접수와 Phase 5 전화번호 목록·상세 조회는 이전 릴리스에서 실제 검증했습니다. 2026-10-16 AWS 로그인 복구 후 기존 Lambda 구성과 로컬 사용자 호출 권한을 DryRun으로 확인했지만 EC2의 직접 Bedrock 호출은 수행하지 않았습니다. 현재 운영 사진 판별은 LiteLLM 프록시를 사용합니다.

- 사진 판별: 내부 LiteLLM HTTPS 프록시를 운영에 연결했고, 외부 HTTPS 사전 검사에서 공유 킥보드 사진 허용·무관 JPEG 거부를 확인했습니다. 직접 Bedrock용 Converse 서비스와 독립 `BEDROCK_REGION` 설정은 대안으로 남겼습니다. EC2 역할은 S3 용도로 연결됐지만 직접 Bedrock 유효 권한·이미지 호출·Anthropic 최초 사용 요건은 검증 전입니다. 기존 Lambda는 DynamoDB 대화 저장을 사용하는 챗봇이어서 사진 판별에 연결하지 않습니다. 최종 신고 제출·브라우저 사진 조회는 아직 검증하지 않았습니다.
- S3: 서버 정제 후 업로드·실패 시 정리·내부 조회 URL 생성과 `aws:check`를 구현했습니다. 비공개 버킷과 EC2 IAM 역할 연결, 개발 PC·서버의 실제 쓰기·읽기·삭제를 확인했습니다. 현재 운영 사진 저장은 `s3`이며 기존 6장의 S3 이전·해시 검증을 마쳤습니다. 브라우저가 버킷으로 직접 업로드하지 않고 백엔드를 거칩니다. 운영 브라우저에서 이전 사진 조회와 새 신고 제출은 아직 확인하지 않았습니다.
- 전화번호 조회: 기존 전화번호 HMAC과 키 버전으로 실제 DB를 검색하며 목록·상세·공개 처리 이력을 반환합니다. 기존 DB와 조회 HMAC 키를 사용하므로 OTP·SMS 서비스나 별도 인증 설정은 필요하지 않습니다.
- 지도: NAVER SDK 로더·핀 이동·역지오코딩 어댑터는 구현되어 있습니다. 위 설정을 준비한 뒤 실제 계정·도메인·모바일 환경에서 확인해야 합니다.

## 알려진 한계와 다음 작업

- QR 자동 판별은 사진에서 확인한 카카오·빔·지쿠의 일부 형식으로 제한됩니다. 지쿠는 `08201`+6자리 형식만 번호를 추출하고 이전 10자리 토큰은 업체만 판별합니다. 숫자만 있는 QR은 업체를 확정하지 않으며 사용자가 빔을 선택했을 때만 5자리 번호를 입력합니다. 일레클·알파카·스윙 등 미확인 형식은 원문을 보존하고 수동 입력합니다.
- 제출 전 사진·위치·QR·연락처 초안은 화면을 떠나거나 새로고침하면 사라집니다. 성공한 신고·사진은 서버에 저장되며, 완료 화면은 최소 접수 정보만 세션 동안 유지합니다. 지원 이미지 형식에 HEIC·SVG·애니메이션은 포함하지 않습니다.
- GPS는 브라우저·기기의 정확도에 의존하며 실제 스마트폰 카메라·위치 권한과 Safari는 검증 전입니다. 지도 SDK 대역 테스트와 실제 NAVER 서비스 검증을 구분합니다.
- 운영 LiteLLM은 공개 공유 킥보드 사진 1장과 생성한 무관 JPEG 1장의 사전 판정만 확인했습니다. 다양한 실제 사진의 오탐/미탐·응답시간과 최종 신고 제출은 추가 검증이 필요합니다. 직접 Bedrock의 모델 권한·판별 품질도 미검증이며 개발 Mock은 실제 AI 성능 평가에 사용할 수 없습니다.
- 신고 저장·접수번호 발급과 전화번호 목록·상세 조회는 개발 PC와 EC2에서 동작하고 실제 HTTPS 흐름을 검증했습니다. 실제 지자체 전송·좌표 기반 관할 배정은 없으며 서버가 지정한 `local-development` 지역에 저장합니다. DB 관리자 인증은 EC2에서 검증했으며 새 관리자 실데이터·테넌트 범위 권한·수거/견인 완료 처리 기능은 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다. 테넌트 계정 생성 UI와 실제 관할 등록은 남아 있습니다.
- 저장 실패가 확인되면 해당 시도의 로컬 사진 폴더 또는 S3 객체 정리를 시도합니다. DB 커밋 결과와 재조회가 모두 불확실하면 이미 접수된 사진을 지우지 않도록 보존합니다. 이 경우나 프로세스 중단·삭제 실패로 남은 고아 파일·객체를 주기적으로 정리하는 기능은 아직 없습니다.
- `/api/reports/status`는 사진 판별 모드를 알리고 활성 지역·테넌트의 DB 조회로 접수 준비 여부를 확인합니다. `disabled`여도 접수 가능하며, 이때 사진 내용은 판별하지 않습니다. 상태 응답은 Bedrock 실제 호출·저장 폴더 쓰기 권한·S3 통신·모든 유형의 활성 여부까지 보장하지 않으며 실제 오류는 사진 확인 또는 제출 시 안내합니다. 실패하면 화면의 입력을 유지해 재시도할 수 있습니다.
- EC2 초기 배포와 외부 API 접수·재시도, 모바일 Chrome 초기 흐름·인증서 갱신 검사를 완료했습니다. S3 전환 직전 환경파일·DB·사진 백업과 기존 사진 이전은 확인했으며 정기 백업·복구, 실제 휴대전화, S3 전환 후 관리자·시민 사진 화면과 새 신고 제출은 남아 있습니다. SSH 22는 사용자 요청으로 `0.0.0.0/0` 허용을 계속 유지하며 자동으로 만료·복원하지 않습니다. EC2 공인 IP는 고정하지 않아 중지·시작 시 주소 변경에 맞춰 인증서·Nginx·Origin을 다시 준비해야 합니다. DB 관리자 인증을 배포·검증했으며 개발 관리자·Mock AI는 비활성화 상태를 유지하고 PostgreSQL은 비밀번호 인증을 사용합니다. [배포 안내](deploy/README.md)에 현재 상태와 갱신 절차를 기록합니다.

**Phase 6의 DB 관리자 로그인·영속 세션은 구현·EC2 검증을 완료했습니다.** 새 관리자 DB 대시보드·목록·상세·비공개 사진·서버 권한·처리중·수거/견인·메모는 구현·로컬 검증과 이전 EC2 릴리스의 실제 HTTPS 검증을 완료했습니다. 관리자 지도는 배포·실제 NAVER SDK 검증을 완료했으며 테넌트 계정 생성 UI·실제 관할 등록·통계는 미구현이므로 Phase 6 전체 완료는 아닙니다. Phase 5의 인증 없는 전화번호 조회와 제출 지연 수정은 이전 릴리스에서 검증했습니다. 2026-10-23 S3 전환과 기존 사진 6장 이전·검증 후 `20261023-litellm-photo-1`에서 LiteLLM 사진 판별을 활성화했습니다. 외부 HTTPS 사전 검사에서 공유 킥보드 사진 200·무관 JPEG 422를 확인했고 신고는 생성하지 않았습니다. 신규 신고 최종 제출·운영 브라우저 사진 조회·전체 흐름은 아직 검증하지 않았습니다.
