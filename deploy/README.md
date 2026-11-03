# EC2 웹·API·PostgreSQL과 비공개 S3 사진 배포

2026-11-03 `20261103-staff-roles-1`을 EC2에 배포했습니다. 관리자 화면과 수거 담당자 화면을 계정 역할별로 분리하고, 수거 화면을 `/collect`로 이동했습니다. 수거 담당자는 현장에 기기가 없으면 사유를 기록하고 관리자가 최종 반려할 수 있습니다. 운영 DB에 수거 역할·현장 기록 마이그레이션 2개를 적용하기 전 `/var/backups/parkick/staff-roles-20261103-1`에 DB·환경 설정·로컬 사진을 백업해 검증했습니다. 기존 관리자 계정은 변경하지 않고 `collector1@parkick.com`을 `COLLECTOR`로 발급했습니다. 로컬·Linux 빌드와 테스트 192건이 통과했고 실제 HTTPS에서 수거 계정 로그인·수거 지도 200, 관리자 대시보드 403, 로그아웃 204를 확인했습니다. 새 신고 제출이나 운영 신고의 상태 변경은 하지 않았습니다.

2026-10-25 `20261025-hotspot-circles-1`을 EC2에 배포했습니다. 관리 모드 지도의 빨강·노랑 구역 원은 유지하고 중앙의 중복 숫자 배지만 제거했습니다. 기존 신고 건수 마커, 구역 표시 토글, 패널의 구역 수는 그대로입니다. EC2 프런트엔드 lint·16개 테스트·Linux 빌드와 실제 HTTPS 화면의 대역 API 브라우저 검증을 통과했습니다. 운영 DB·S3·환경 설정은 변경하지 않았으며 이전 `20261025-admin-hotspots-1`은 복구용으로 보존했습니다.

2026-10-25 `20261025-admin-hotspots-1`을 EC2에 배포했습니다. 관리 모드 지도에서 150m 이내의 신고를 묶어 5건 이상은 빨간 집중 구역, 3~4건은 노란 관심 구역으로 표시하고 토글로 켜고 끌 수 있습니다. 기존 `20261025-chatbot-1`은 복구용으로 보존했습니다. EC2에서 프런트엔드 16개·백엔드 184개 테스트와 lint·Linux 빌드가 통과했고, HTTPS 관리자 화면·API 상태와 운영 PostgreSQL 읽기 전용 집계를 확인했습니다. 당시 전체 신고 14건에서 집중·관심 구역은 총 1곳이었습니다. DB 마이그레이션이나 신고 데이터 변경은 없었습니다.

2026-10-25 `20261025-chatbot-1`을 EC2에 배포했습니다. 기존 서버의 비공개 LiteLLM 주소·키를 `CHATBOT_*` 설정에 재사용했고 공개 홈에 안내 챗봇을 추가했습니다. 새 릴리스에서 프런트엔드 16개·백엔드 180개 테스트와 lint·Linux 빌드가 통과했습니다. 외부 HTTPS `POST /api/chat`은 `gateway` 모드와 답변을 반환했고, 모바일 Chrome에서 위젯 열기·자유 질문 응답·페이지 오류 0건을 확인했습니다. 이전 릴리스와 환경파일 백업은 보존했으며 시험 신고, DB 마이그레이션, S3 사진 변경은 없었습니다.

이전 `20261025-live-photo-guidance-1`에서는 촬영 중 AI 안내를 추가했습니다. 당시 외부 HTTPS API에서 합성된 무관한 사진은 약 1.46초에 `no_vehicle`로 응답했고, 가상 카메라를 사용하는 모바일 브라우저에서 안내 표시와 카메라 종료를 확인했습니다. 사진 AI 경로는 LiteLLM 프록시를 통한 Bedrock 호출입니다. 실기기 카메라와 실제 현장 사진의 안내 품질은 추가 검증이 필요합니다.

2026-10-23 현재 `SafeInstanceProfile-sgu-202686`을 운영 EC2에 연결했고, EC2의 `parkick` 서비스 계정에서 S3 임시 객체 쓰기·읽기·삭제를 확인했습니다. 운영 API는 `REPORT_STORAGE_PROVIDER=s3`, 사진 판별은 `AI_PROVIDER=litellm`입니다. 기존 신고 사진 6장(총 12,195,775바이트)은 S3로 이전하고 DB 경로를 변경했으며, 이전 후 6장 모두 S3 조회 검증을 통과했습니다. EC2 로컬 원본은 복구를 위해 보존합니다. 내부 LiteLLM 프록시의 HTTPS 접속·모델 목록과 실제 Parkick 사진 사전 검사에서 관련 사진 허용·무관 사진 거부를 확인했습니다. [역할 및 AI 연동 안내](iam-admin-setup.md)를 참조하세요.

Ubuntu EC2 한 대에서 Nginx, Node.js 22, PostgreSQL을 실행하고 신고 사진은 서울 리전의 비공개 S3 버킷에 저장합니다. Nginx가 HTTPS와 React 정적 파일을 제공하고 `/api/`를 `127.0.0.1:4000`으로 전달합니다. EC2의 `/var/lib/parkick/reports`에는 이전한 사진의 복구용 원본을 보존하며 정적 웹 경로에 포함하지 않습니다. S3 접근에는 연결된 EC2 인스턴스 프로필의 임시 자격증명을 사용합니다.

**운영 EC2는 현재 `20261103-staff-roles-1` 릴리스입니다.** 주소는 **[https://15.165.235.154](https://15.165.235.154)**입니다. `/api/health`는 사진 판별 `litellm`과 사진 저장 `private-s3`를, `/api/reports/status`는 접수 `available=true`·저장 `s3`를 반환합니다. `/api/health.services.ai`의 `disabled`는 사용하지 않는 이전 텍스트 신고문 생성기를 가리키며 현장 사진 판별 상태는 `photoValidation`에서 확인합니다. 챗봇은 별도의 `CHATBOT_PROVIDER=gateway` 설정으로 연결했고 실제 HTTPS 자유 질문 응답을 확인했습니다. 이전 릴리스에서 외부 HTTPS `POST /api/reports/validate-photos`는 공유 킥보드 사진 200·`valid=true`, 무관한 빨간 JPEG 422·`PHOTO_NOT_PM`이었습니다. S3 역할의 임시 객체 작업과 기존 사진 6장의 이전·조회도 이전 릴리스에서 확인했습니다. 운영 관리자·시민 브라우저의 이전 사진 표시와 신규 신고 전체 흐름은 아직 별도 검증이 필요합니다.

2026-10-25 관리자 대시보드에 **관리 모드 / 수거 모드** 전환을 추가하고 EC2에 배포했습니다. 수거 모드는 기기 GPS로 현재 위치를 확인해 네이버 지도와 미완료 신고 목록을 표시합니다. 목록은 현재 위치에서 직선거리 가까운 순으로 정렬하며 업체·기기번호·위치·신고유형·거리를 보여줍니다. EC2에서 프런트엔드·백엔드 lint와 빌드가 통과했고, 운영 PostgreSQL 읽기 전용 조회에서 미완료 신고 8건의 거리순 정렬을 확인했습니다. 비로그인 API는 401이었고 실제 HTTPS 화면에서는 관리자 API만 대역한 브라우저 테스트 2개와 네이버 지도 타일·신고 마커·현재 위치 마커 표시가 통과했습니다. 테스트 신고나 DB 변경은 없었습니다.

같은 날 `20261025-admin-sidebar-1`에서는 데스크톱 관리자 메뉴를 이전의 고정 사이드 메뉴로 복원했습니다. 관리·수거 모드와 계정 메뉴는 유지하고 1050px 이하에서는 기존 햄버거 메뉴를 사용합니다. 프런트엔드 lint·빌드와 실제 HTTPS 브라우저에서 데스크톱 사이드 메뉴, 수거 모드, 모바일 메뉴, 가로 넘침 없음이 확인됐습니다. 백엔드와 DB 스키마는 변경하지 않았습니다.

`20261025-admin-list-focus-1`에서는 수거 대상 목록 항목을 누르면 네이버 지도가 해당 신고 좌표로 이동·확대하고 신고 정보창을 엽니다. 상세 페이지 링크는 항목에 별도로 두었습니다. 로컬 모의 지도 테스트에서 좌표 이동·확대·정보창·반복 선택을 확인했고, EC2 프런트엔드 lint·빌드 및 실제 HTTPS 브라우저에서 네이버 지도 타일 24개와 두 번째 신고 선택·정보창·상세 링크, 모바일에서 항목 선택 후 지도가 화면에 보이는 동작을 확인했습니다. 브라우저 API 응답만 대역했으며 운영 DB에 신고를 생성하지 않았습니다.

`20261025-admin-top-nav-1`에서는 PC 관리자 메뉴를 상단 헤더로 되돌렸습니다. 1050px 이하의 기존 햄버거 메뉴와 수거 모드·신고 위치 정보창은 유지합니다. Frontend lint·빌드와 실제 HTTPS 브라우저에서 1440px·1051px 상단 메뉴, 1050px·390px 모바일 메뉴, 가로 넘침 없음과 관리·수거 모드 전환을 확인했습니다. 새 릴리스는 소스를 별도로 복제하고 변하지 않은 의존성 파일만 하드 링크로 공유해 이전 릴리스를 보존했습니다. 이 릴리스에서는 npm install/ci를 실행하지 않습니다.

`20261025-admin-rejected-1`에서는 관리자 관리 모드의 상단 집계를 `오늘 접수 / 접수 / 반려 / 처리 완료`로 바꾸고, 신고 상세에서 실제 `반려` 상태를 저장할 수 있게 했습니다. 기존 `처리중` 신고는 조회와 반려가 가능하지만 새 화면에서 처리중으로 변경하는 버튼은 표시하지 않습니다. 반려는 이력에 남고 시민 조회에 공개 처리 메모만 표시되며 수거 목록·같은 기기 함께 처리에서는 제외됩니다. DB에는 기존 상태를 변경하지 않고 `REJECTED` enum 값만 추가했습니다. 운영 DB의 마이그레이션 전 백업은 `/var/backups/parkick/admin-rejected-20261025-1/parkick-before-rejected.dump`에 보관합니다. EC2의 격리 PostgreSQL에서 신규 통합 테스트 18개, 백엔드 단위 테스트 156개, 프런트엔드 lint·빌드, 운영 DB 읽기 검사와 실제 HTTPS 화면의 API 대역 브라우저 검증이 통과했습니다. 브라우저 검증은 반려 요청을 가로채 운영 신고를 변경하지 않았습니다. 실제 반려 신고가 생성된 뒤에는 이전 코드가 새 상태를 읽지 못할 수 있으므로 단순 코드 롤백 대신 새 상태를 이해하는 수정본으로 복구해야 합니다.

`20261025-collection-field-1`에서는 휴대전화 수거 모드에서 가까운 신고 목록을 먼저 보여주고 지도를 필요할 때 펼치게 했습니다. 상세 확인과 처리 후에는 수거 모드의 페이지·선택 항목·목록 스크롤 위치로 돌아옵니다. 각 신고의 도보·차량 길찾기는 네이버 지도 앱 URL Scheme으로 연결하며 목록의 거리는 이동 거리나 시간이 아닌 직선거리로 표시합니다. 수거 모드가 화면에 열려 있을 때만 GPS를 갱신하고 정확도·마지막 확인 시각을 표시합니다. 현장 상세에서는 업체·기기번호·위치·접수 시각과 사진 다음에 수거 완료 버튼을 배치하고, QR 재확인은 선택 기능으로 제공합니다. 현장에 기기가 없다면 반려 사유를 시민에게 공개되는 메모에 입력하도록 했습니다. EC2에서 프런트엔드 lint·빌드·단위 테스트 16개가 통과했고, 실제 HTTPS 화면에서 모든 관리자 API를 대역한 모바일 브라우저 검사 4개가 통과했습니다. 시험 신고와 운영 DB 변경은 없었습니다. 휴대전화의 실제 네이버 앱 전환과 이동 중 GPS는 실기기에서 추가 확인해야 합니다.

`20261024-mobile-steps-2`는 QR 확인·위치 확인·신고 유형 화면을 높이 667px인 모바일 화면에도 맞추는 추가 CSS 수정본입니다. 위치 단계의 좌표·정확도 카드와 평상시 수동 위도·경도 입력은 제거하고, GPS 또는 지도 오류 때 수동 입력을 보여줍니다. EC2 전환과 API health 검증을 완료했으며 운영 브라우저의 최종 화면 검증은 별도로 기록합니다.

`20261024-mobile-steps-3`은 모바일 단계 이동 시 제목에 초점을 맞추되 자동 부드러운 스크롤을 피하고 화면을 맨 위로 되돌립니다. 이전 위치 단계 화면 검사에서 상단 헤더가 보이지 않는 상태가 있어, 최종 검증은 헤더를 포함한 스크롤 위치 0에서 다시 수행했습니다. EC2 배포와 실제 HTTPS 모바일 화면 검증을 완료했습니다.

`20261024-mobile-steps-4`에서는 높이 667px 화면의 QR 단계에서 **기타 업체**를 입력할 때도 다음 버튼이 보이도록 업체 선택과 기타 업체명 필드를 나란히 배치했습니다. 새 빌드의 실제 HTTPS 브라우저 검증에서 390×844와 390×667 화면 모두 스크롤 없이 다음 버튼이 보였습니다.

`20261024-mobile-steps-5`는 같은 두 열 배치를 높이와 무관하게 모바일 화면 전체에 적용했습니다. 실제 HTTPS 브라우저의 390×844 화면에서 기타 업체를 선택했을 때 다음 버튼 하단이 817px로 확인됐고, 390×667 화면에서도 619px로 보였습니다.

`20261024-mobile-steps-7`에서는 신고 화면의 모바일 전용 푸터·중복 설명·단계 하단 문구와 불필요한 아래 여백을 제거해, 버튼만 보이는 수준을 넘어 문서 전체가 화면 높이에 맞게 했습니다. 실제 HTTPS 브라우저에서 390×844·390×667의 QR 기본/수동/기타 업체, 정상 GPS 위치, 신고 유형 일반/기타 화면 모두 페이지 높이가 화면 높이와 같았습니다.

`20261024-admin-collect-area-1`에서는 관리자 신고 상세와 같은 기기 신고 함께 처리에서 신규 완료 선택을 `수거 완료`로 통일하고 `견인 완료` 버튼을 제거했습니다. 과거 견인 기록은 이력의 정확성을 위해 그대로 표시합니다. 기존 시연 기관·지역에 속한 신고는 목록·상세 화면에서 시연 명칭을 표시하지 않고 입력된 주소의 시·군·구를 `경기도 용인`처럼 신고 지역으로 표시합니다. 이는 화면의 주소 기반 표기이며 DB의 관할·기관 배정이나 관리자 접근 범위를 변경하지 않습니다. 운영 DB에는 주소 기준 용인 8건·그 외 1건이 있어 일괄 용인 표기로 바꾸지 않았습니다. 새 릴리스에서 Frontend lint·운영 빌드, API health와 외부 HTTPS 상세 경로 200을 확인했고 시험 신고는 생성하지 않았습니다.

**Phase 5 수정본을 EC2에 반영했고 Linux 운영 빌드·health 및 실제 HTTPS 브라우저의 신고→전화번호 조회 검증을 통과했습니다.** 전화번호 목록·상세 조회와 XHR의 5분 제출 대기·실측 진행률을 구현했으며 로컬에서 Frontend lint·운영 빌드, Backend lint·테스트 74개, PostgreSQL 통합 총 11개(기존 8개·조회 3개), 제출 브라우저 7개(65초 지연 1개 포함), Phase 1 회귀 3개를 통과했습니다. 로컬에서는 전체 Wizard 제출부터 실제 DB 목록·상세, 뒤로 이동·번호 변경 초기화·직접 상세 재입력까지 확인했습니다.

**DB 관리자 계정·영속 세션 로그인 수정본의 EC2 배포와 실제 로그인 검증을 완료했습니다.** Backend 단위/API **80/80개**, 실제 PostgreSQL 통합 **14/14개**(신규 인증 3개 포함), Backend lint·TypeScript 컴파일·Prisma 엔진 복사, Frontend lint·운영 빌드와 기존 관리자 로그인·로그아웃 브라우저 회귀 **1개**를 통과했습니다. DB 통합 검사에서 앱 재시작 후 세션 유지와 재로그인·로그아웃의 세션 해지도 확인했습니다. 실제 HTTPS에서 미인증 401 → 로그인 200(`database`, `PLATFORM_ADMIN`) → Secure·HttpOnly·SameSite=Strict 쿠키 → 새로고침 세션 복원·대시보드 200 → 로그아웃·기존 토큰 401을 확인했고 브라우저 오류가 없었습니다. 이 기록은 기존 관리자 인증 릴리스의 운영 검증입니다.

**2026-10-16 새 관리자 신고 관리 수정본은 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다.** 실제 DB 대시보드의 전체·당일(KST)·상태별 집계와 최근 10건, 신고 목록·필터·검색·페이지 이동, 상세·비공개 사진, 처리중·수거/견인 완료·공개/내부 메모를 연결했습니다. 서버는 플랫폼 관리자의 전체 접근과 테넌트 관리자의 `tenantId` 소속 범위를 구분합니다. Backend 단위/API 91개·실제 PostgreSQL 통합 20개, Frontend lint·운영 빌드, 새 관리자 브라우저 2개·기존 회귀 3개를 통과했습니다. 2026-10-16 00:37:35.877 KST(2026-10-15T15:37:35.877Z) 실제 HTTPS 검증에서 DB 대시보드·검색·비공개 사진, 처리중→수거 완료·직접 견인 완료, 동일 요청 재시도 시 이력 중복 없음, 완료 내용 변경 409, 시민 조회의 공개 메모만 반환, 모바일 가로 넘침 없음을 확인했습니다. 검증용 신고 정확히 2건과 해당 사진만 정리했고 기존 DB·사진·관리자 설정·연락처 키를 보존했습니다. 이번 배포에서는 DB Migration을 실행하지 않았습니다. 테넌트 계정 생성 UI·실제 관할 등록과 통계는 미구현이며 Phase 6 전체 완료로 표시하지 않습니다. 관리자 지도도 별도 수정본의 배포·실제 NAVER SDK 검증을 완료했습니다.

이전 운영 로그에는 제출 약 62초 후 클라이언트 연결 종료인 499, 이후 요청 약 55초 후 201이 기록됐습니다. 기존 브라우저의 60초 제한이 느린 사진 전송·접수 확인을 중단할 수 있어 제출만 300초 제한으로 변경했습니다. 전송 진행률은 실제 바이트를 사용하며 전송 완료 후에는 서버 접수 확인 상태를 표시합니다. 300초 후 결과가 불명확해도 같은 내용의 재시도에는 기존 UUID를 유지합니다. 사용자 IP나 신고 원문은 이 진단 기록에 포함하지 않습니다.

**2026-10-17 사진 업로드 최적화를 EC2에 배포했습니다.** 브라우저에서 사진 방향을 반영하고 긴 변 최대 2,560px·JPEG 품질 0.85로 준비하며 작은 파일은 확대하지 않습니다. 미리보기와 실제 전송 파일이 같고 재시도에도 같은 파일·접수 식별자를 유지합니다. 실제 첨부 사진 4장은 약 2.3~2.6MB에서 0.35~0.52MB로 줄어 77.5~86.7% 감소했습니다. 기기번호·주변 상황 가독성을 확인했습니다. 실제 HTTPS 페이지의 브라우저 검증은 모든 API 쓰기를 차단했으며 휴대전화 통신망에서의 접수 시간은 측정하지 않았습니다. 실제 DB 저장은 격리된 테스트 PostgreSQL에서 회전된 대형 사진으로 검증했습니다. 요청한 모도리 신고 3건과 사진 3장·연관 데이터 삭제도 완료했고 기존 다른 신고 3건을 보존했습니다.

| 항목 | 현재 상태 |
|---|---|
| AWS 환경 | 로컬 프로파일 `parkick`, 서울 `ap-northeast-2` |
| EC2 | `sgu-202686-ec2` / `i-0a95ee1a77e3722a4`, Ubuntu 24.04, `t3.small` 2 vCPU·2GiB, 실행 중·상태 검사 2/2 통과 |
| 디스크·CPU | 암호화된 30GiB gp3, 인스턴스 종료 시 볼륨 보존(`DeleteOnTermination=false`), CPU 크레딧 Standard |
| 네트워크 | 공인 IP `15.165.235.154`, SG `sg-005d27768eef97969`; 웹 80·443 공개, SSH 22는 사용자 요청으로 `0.0.0.0/0` 허용 유지 |
| 사진 저장 | 운영 신규 사진과 기존 6장의 활성 경로는 `sgu-202686-s3/reports/`; EC2의 `/var/lib/parkick/reports`에는 이전 원본을 복구용으로 보존 |
| S3 | `sgu-202686-s3`: 퍼블릭 액세스 차단 네 항목 활성화, Bucket owner enforced, SSE-S3(AES256); 기존 `SafeInstanceProfile-sgu-202686` 연결 |
| 실제 검증 | 개발 PC와 EC2 `parkick` 서비스 계정에서 `reports/` 임시 객체 쓰기·읽기·바이트 비교·삭제 통과; 기존 6장 S3 조회·해시 확인 |
| 설치·빌드 | Node 22.23.3·PostgreSQL 16·Nginx, `npm ci`·Frontend/Backend 운영 빌드·Migration·시연 seed 성공 |
| 실행 상태 | API·Nginx·PostgreSQL 활성화; production·DB configured·private-s3, 접수 상태 available=true·s3 |
| HTTPS | Certbot snap 5.8.0, Let’s Encrypt shortlived IPv4 인증서 발급·Nginx 적용; 2026-10-23 재확인 만료 2026-10-29 12:13:11 UTC, 외부 HTTPS 기본 인증서 검증 통과 |
| 갱신 | `snap.certbot.renew.timer` enabled·active; renew dry-run·deploy hook 종료 코드 0, 모의 갱신 전체 성공 확인 |
| 외부 API 검증 | 6개 통과: health/API, SPA 3개 경로·JS 번들, HTTP→HTTPS, 전화번호 없는 테스트 신고 201·재전송 200, 공개 신고 사진 API 404 |
| 모바일 Chrome | 390×844에서 secure context·홈 이미지·직접 입력→사진 단계·직접 주소 새로고침·런타임 오류 없음, 5개 통과 |
| 실제 저장·정리 | 테스트 신고의 DB 관계·JPEG 해시·EXIF 제거·파일 권한·실제 사진 경로의 비공개 접근 검증 통과; 생성한 테스트 신고·관계 데이터·사진 1개만 정리 완료 |
| 현재 배포 릴리스 | `/srv/parkick/app` → `/srv/parkick/releases/20261103-staff-roles-1`; 관리자·수거 역할 분리 및 수거 계정 발급, 이전 `20261025-hotspot-circles-1` 보존 |
| Phase 5 과거 배포 검증 | 당시 실제 HTTPS 모바일 390px의 6단계 신고→201→완료 영수증→번호 목록 200·no-store→상세 처리 이력 통과; 새 5단계의 검증 결과가 아님 |
| Phase 5 운영 테스트 자료 | 테스트 2건의 표식·UUID·접수번호·내용·해시 일치를 확인하고 해당 DB 관계·사진만 정리 완료; 기존 사용자 데이터 유지 |
| 관리자 인증 검증 | 지정 플랫폼 관리자 등록 후 2026-10-15 23:31:34 KST(14:31:34 UTC)에 실제 로그인·새로고침·로그아웃과 기존 토큰 무효화 통과; production·개발 Mock 비활성화·기존 DB·사진·전화번호 키 유지 |
| 관리자 신고 관리 | DB 대시보드·목록·상세·사진·권한·처리중/수거 완료·메모 연동; 과거 견인 이력 보존 |
| 사진 내용 판별 | 운영 `AI_PROVIDER=litellm`; 외부 HTTPS 사전 검사에서 공유 킥보드 사진 200·무관 JPEG 422. 최종 신고 제출은 미검증. 직접 EC2 Bedrock 호출은 별도 대안 |
| Client ID 최신 반영 | 2026-10-16 16:12:57 KST Frontend 재빌드·배포 완료; 새 ID로 지도·타일 9개 표시 확인, 주소 API는 여전히 HTTP 403 |
| 후속 작업 | 테넌트 계정 생성 UI·실제 관할 등록, 통계, 실제 휴대전화·백업 등 운영 검증 |

최초 SSH 문제는 웹 IP 조회 결과 `211.234.206.233`과 당시 실제 SSH 출발지 `211.234.206.163`의 차이로 발생해 출발지 확인 후 해결했습니다. 이후 `211.37.75.121/32` 제한으로 재접속을 확인했으며, 현재는 사용자의 최신 요청에 따라 TCP 22를 **`0.0.0.0/0`**에 계속 허용합니다. 자동 만료·복원은 없으며 사용자가 명시적으로 요청할 때만 변경합니다. Git SSH의 ED25519 호스트 키를 확인·고정해 사용합니다. Windows keyscan은 KEX 오류로 사용하지 않았습니다. Instance Connect Endpoint는 생성하지 않았으며 필요하지 않습니다. `SafePowerUser`는 새 역할 생성을 거부하지만, 기존 EC2 인스턴스 프로필을 연결해 S3 전환을 완료했습니다.

**이전 릴리스 기록:** `20261021-qr-step-1`은 `20261019-demo-label-1`을 복제해 변경 파일만 설치했으며 새 소스 아카이브는 만들지 않았습니다. 기반 릴리스의 원본 소스 아카이브 SHA-256은 `537aa706d8768360721dc945bc5a8fd6e1a625756d53e59104c01c84f158b646`입니다. 현재 운영 상태는 [deployment-status.json](deployment-status.json)에서 확인할 수 있습니다.

**2026-10-22 현재 릴리스 확인:** `/srv/parkick/releases/20261022-five-step-deferred-1`로 전환했습니다. 외부 HTTPS에서 `/api/health`와 `/api/reports/status`가 정상 응답했고 접수 준비 상태는 `available: true`, 사진 판별 모드는 `disabled`였습니다. `POST /api/reports/validate-photos`는 합성 정상 PNG에 200, PNG로 위장한 텍스트에 400을 반환했습니다. 헤드리스 데스크톱 Chrome의 390px 모바일 화면 크기로 실제 HTTPS `/report`를 읽기 전용 검사해 `STEP 01/05`에서 빔과 기기번호를 수동 입력한 뒤 사진 `STEP 02/05`로 이동했고 AI 비활성·형식 검사 안내와 런타임 오류 0건을 확인했습니다. 실제 휴대전화는 사용하지 않았습니다. Nginx의 API `proxy_send_timeout`·`proxy_read_timeout`을 300초로 설정하고 `nginx -t`를 통과했습니다. 실제 신규 신고 제출·브라우저 전체 흐름과 Bedrock 이미지 판정은 검증하지 않았고 운영 테스트 신고도 생성하지 않았습니다.

리소스 식별자는 [deployment-status.json](deployment-status.json)에 기록합니다. SSH 개인 키는 버전 관리에서 제외된 로컬 `.tmp/aws/sgu-202686-key.pem`에 보관하며 소스 업로드나 문서 공유에 포함하지 않습니다. 초기 배포와 외부 API·브라우저·갱신 검사를 완료했으며 후속 운영 검증을 포함하는 Phase 8 전체 완료와는 구분합니다.

| 파일 | 용도 |
|---|---|
| `backend.env.example` | 운영 환경변수의 자리표시자 |
| `bootstrap-host.sh` | 새 Ubuntu 24.04 서버의 Node 22·Nginx·PostgreSQL·전용 계정·2GiB swap 준비 |
| `configure-demo.sh` | HTTPS Origin 한 인자로 전용 DB·서버 환경파일·비공개 사진 폴더 준비 |
| `parkick-api.service` | 비루트 계정으로 실행하는 systemd 서비스 |
| `nginx-http-bootstrap.conf` | 최초 인증서 발급을 위한 HTTP 임시 설정 |
| `nginx-parkick.conf` | HTTPS, SPA 라우팅, API 프록시 설정 |
| `iam-s3-reports-policy.json` | S3 `reports/*` 객체 접근용 참고 정책; 운영은 기존 프로필의 검증된 권한 사용 |
| `iam-admin-setup.md` | 연결된 EC2 역할과 AI 연동의 별도 설정·검증 절차 |
| `deployment-status.json` | 생성한 AWS 리소스 식별자와 배포 진행 상태 |
| `seed-demo.ts` | 최초 배포용 시연 기관·지역과 신고 유형 준비 |
| `create-platform-admin.ts` | 표준입력 JSON으로 운영 플랫폼 관리자를 최초 등록; 기존 계정 덮어쓰기 없음 |

운영의 `ENABLE_DEV_ADMIN=false`를 유지하며 `DEV_ADMIN_*`는 로컬 개발에서만 사용합니다. DB 인증은 운영 DB의 관리자 계정·영속 세션을 사용하며 통합 검증·EC2 반영과 실제 로그인 검증을 완료했습니다. `local-development`는 명시적인 시연 기관·지역이며 실제 지자체 관할을 나타내지 않습니다. 새 관리자 신고 관리·테넌트 범위 접근 통제는 로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다. 테넌트 계정 생성 UI와 실제 관할 등록·좌표 기반 자동 배정은 별도 작업입니다.

### 관리자 지도 배포·실제 SDK 검증

2026-10-16 11:55:54 KST(02:55:54Z)에 최종 관리자 지도 수정본 `/srv/parkick/releases/20261016-admin-map-2`를 배포했습니다. 이전 `20261016-admin-map-1`은 보존했습니다. 소스 아카이브 SHA-256은 `b5fb11d34e117c3837ab5d3503e0dbbadbd5991384c9cf0df4214d0a0ecb7c4a`입니다.

대시보드의 지도와 `/admin/map`에서 실제 저장 좌표 마커·동일 위치 신고 묶음·마커 요약→상세 이동·상태/검색·200건 페이지를 사용합니다. API가 플랫폼 전체/테넌트 소속 범위를 강제하며 Reverse Geocoding을 호출하지 않습니다. 따라서 기존 자동 주소 조회의 HTTP 403과 관리자 좌표 지도 기능은 별개입니다. 로컬 검증은 Backend 단위/API 92개·실제 PostgreSQL 통합 22개·지도 브라우저 2개·기존 관리자 회귀 2개를 통과했습니다. 로컬 지도 브라우저 검사는 실제 DB/API와 SDK 대역을 사용했습니다. 2026-10-16 11:56:15.142 KST(02:56:15.142Z)에 실제 NAVER SDK와 합성 신고 3건으로 좌표 마커·동일 위치 묶음·마커 클릭 요약·상세 이동·상태 필터·모바일 화면을 검증했습니다. 관리자 지도에서 Reverse Geocoding 호출이 없음을 확인했습니다. 검증 후 UUID·표식·내용·시각·해시가 일치하는 테스트 신고 3건과 관계 데이터·사진만 정리했으며 기존 신고·관리자를 보존했습니다.

2026-10-16 **17:22:49 KST(08:22:49Z)**에 `/srv/parkick/releases/20261016-admin-clusters-1`을 배포했습니다. 소스 SHA-256은 `bc0e9960ac7431d7f29647aebd5d25c08a1cfe55613793f6341bbe7446cf6612`입니다. 이전 `20261016-reverse-geocoding-1`, 기존 DB·사진·연락처 키·공개 지도 ID를 보존했습니다. DB 스키마·마이그레이션은 변경하지 않았으며 새 릴리스에서 전체 빌드 후 API 정상 응답·신고 접수 준비를 확인했습니다.

관리자 대시보드와 신고 지도는 현재 화면에서 가까운 좌표를 56px 기준으로 묶어 건수를 표시합니다. 묶음 클릭 시 확대해 서로 다른 위치를 나누고, 동일 좌표 및 최대 확대에서도 겹치는 신고는 목록으로 모두 확인합니다. Frontend lint·빌드·단위 10개와 로컬 실제 DB 관리자 지도 브라우저 3개를 통과했습니다. **17:23:37 KST** 실제 NAVER SDK로 기존 API 신고 건수 보존과 브라우저 합성 자료의 묶음·확대 분리·재결합·중복/최대 확대 조회를 확인했습니다. 운영 DB에 테스트 신고를 생성하지 않았고 Reverse Geocoding 호출과 브라우저 오류도 없었습니다.

2026-10-16 **18:13:04 KST(09:13:04Z)** 업체 선택 릴리스 `20261016-operator-selection-1`을 배포했습니다. 소스 SHA-256은 `cf8ac7039d50ed62b8fe474354911f032123e9a793b2d39ff22d9b7f0ae24fb1`입니다. `shared/operators.json`을 포함해 빌드·실행 확인했고, QR·수동 선택·신고 저장·조회에서 업체 표준명을 통일했습니다. 기존 업체명 별칭 1건은 `/var/backups/parkick/operator-names-20261016-selection-1.json`에 원래 값을 0600으로 백업한 뒤 업체명 열만 변경했습니다. 다른 필드와 미등록 업체명은 보존했습니다. 새 업체 선택과 실제 QR 사진 검증에서 운영 신고 생성·사진 업로드는 0회입니다.

2026-10-16 **17:49:18 KST(08:49:18Z)**에 최종 업체 QR 릴리스 `20261016-operator-qr-2`를 배포했습니다. 소스 SHA-256은 `1a92504ebf0d6e170a38a41b78761a6c0428d652afee4438d4a996ff0c4dffbd`입니다. 스키마·마이그레이션 변경 없이 기존 DB·사진·공개 지도 설정을 보존했고 API·접수 준비 검증을 통과했습니다. [업체별 QR 지원 범위·출처](qr-operator-support.md)에 따라 카카오·빔 일부 형식의 업체/번호와 지쿠 일부 형식의 업체명만 자동 입력합니다.

최종 Backend 테스트 **101개**, 전체 브라우저 **26개**와 빔 원문 보완 후 QR 브라우저 **4개 재검증**을 통과했습니다. **17:49:43 KST** 실제 HTTPS 신고 화면에서 사용자 제공 카카오 사진, 공개 빔·지쿠 실물 사진, 숫자 전용 빔 사진을 읽어 자동 입력·수동 대체·확인·다음 단계를 검증했습니다. 원본 사진은 배포하지 않았고 실제 신고 접수·사진 업로드·QR 목적지 방문은 모두 0회입니다. 이전 `20261016-operator-qr-1`과 `20261016-admin-clusters-1` 릴리스를 보존했습니다.

## 1. AWS 준비

EC2는 Ubuntu 24.04 LTS를 기준으로 합니다. Node.js는 최신 보안 패치가 적용된 22.x, 최소 22.18.0을 사용합니다. 지원 버전은 [Node.js 공식 릴리스 정보](https://nodejs.org/en/about/previous-releases)에서 확인합니다.

- 도메인을 사용할 경우 DNS 레코드를 EC2에 연결하고 예시의 `parkick.example.com`을 실제 값으로 교체합니다. 현재 배포는 도메인이 없어 공인 IPv4의 HTTPS를 사용하며 아래 7절의 IP 인증서 절차를 적용했습니다.
- 보안 그룹은 웹용 80·443을 허용하며, SSH 22의 `0.0.0.0/0` 허용은 사용자 요청대로 계속 유지합니다. 사용자가 명시적으로 요청할 때만 변경합니다. API 4000과 PostgreSQL 5432는 외부에 열지 않습니다.
- PostgreSQL 데이터와 전화번호 암호화 키는 EC2의 지속 볼륨에 저장합니다. 운영 사진은 S3에 있으며, 서버 교체·복구 전에는 DB와 S3 객체, 남겨둔 로컬 사진 원본을 함께 점검합니다.
- 초기 `local` 저장은 IAM 역할을 쓰지 않았습니다. 현재 `s3` 저장은 EC2에 연결된 기존 프로필의 임시 자격증명을 사용하며 버킷의 공개 차단·암호화를 유지합니다.

S3 전환 결과와 재검증 절차는 9절에 기록했습니다. 초기 배포를 위해 RDS·ECS·Secrets Manager·Parameter Store를 추가하지 않았습니다.

2026-10-15 확인 당시 EC2 디스크 여유는 약 22GB, 신고 사진 사용량은 약 4.6MB였습니다. 2026-10-23에는 웹·API·DB는 EC2에 유지하고 사진 저장만 S3로 옮겼습니다. 로컬 원본을 보존하므로 디스크 사용량은 바로 줄지 않으며, 원본 정리 전에 운영 조회·복구와 백업 절차를 검증해야 합니다.

## 2. 서버와 소스 준비

새 Ubuntu 24.04 호스트에 `bootstrap-host.sh`를 먼저 업로드하고 실행합니다. 현재 EC2에서는 이미 완료했으며 기존 Node·Nginx·PostgreSQL이 있는 다른 서버에 그대로 적용하지 않습니다.

```bash
sudo bash bootstrap-host.sh
```

스크립트는 공식 Node 22 바이너리의 SHA256을 확인하고 버전을 서버에 기록하며, Nginx·PostgreSQL과 `parkick` 전용 계정·소스 폴더·0700 사진 폴더를 준비합니다. 2GiB 인스턴스의 빌드를 위해 암호화된 EBS에 2GiB swap을 만듭니다. Nginx는 최초 HTTPS 설정 전 정지 상태로 두며 현재 EC2에서는 이후 설정을 마쳐 실행 중입니다.

다음 명령은 최초 설치용입니다. 현재 `/srv/parkick/app`은 릴리스 디렉터리를 가리키는 심볼릭 링크이므로 재배포는 8절처럼 별도 릴리스에서 준비합니다. 검토한 소스에 `parkick` 빌드 권한을 설정하고 로컬 `.env`, `node_modules`, `backend/data`, 테스트 산출물은 업로드하지 않습니다. Windows Prisma 엔진도 가져오지 않고 EC2에서 다시 생성합니다.

```bash
sudo chown -R parkick:parkick /srv/parkick/app
cd /srv/parkick/app
sudo -u parkick -H npm ci --include=dev
```

프론트엔드의 `frontend/.env.production`에는 공개 설정만 둡니다. 다음 값은 예시이며 네이버 지도 Client ID는 실제 도메인을 네이버 서비스 URL에 등록한 뒤 입력합니다.

```dotenv
VITE_API_BASE_URL=/api
VITE_NAVER_MAP_CLIENT_ID=
```

```bash
sudo -u parkick -H npm run build
```

빌드 산출물은 `frontend/dist`와 `backend/dist`입니다. Nginx의 `www-data` 계정이 `frontend/dist`를 읽고 상위 디렉터리를 통과할 수 있어야 합니다. 운영 환경파일은 이 정적 파일 경로 밖에 둡니다.

2026-10-16 로컬 `frontend/.env`의 `VITE_NAVER_MAP_CLIENT_ID` 설정을 확인하고 **11:16:06 KST에 Frontend만 다시 빌드·배포했습니다.** 서버 `frontend/.env.production`에는 공개 설정 `VITE_API_BASE_URL`·`VITE_NAVER_MAP_CLIENT_ID` 두 키를 보존했고 Backend·DB는 재시작하지 않았습니다. 지도 키는 빌드 산출물에 포함되므로 운영 키 변경 시 Frontend 재빌드·배포가 필요하며 로컬 개발 서버도 재시작해야 합니다. 실제 HTTPS 모바일 브라우저에서 SDK 200·지도 표시·타일 9개 로드는 통과했지만 자동 주소 조회는 HTTP 403으로 실패했습니다. 해당 애플리케이션의 Reverse Geocoding 사용 설정과 권한 확인이 남아 있습니다. 지도 인증 실패 callback·브라우저 오류·실제 GPS 요청·신고 제출은 없었습니다. 기존 화면의 index와 공개 환경 설정은 `frontend/naver-backup-20261016-1`에 보존했고 기존 정적 자산도 유지했습니다. 이번 Frontend 아카이브 SHA-256은 `c3f6b64c06c1184e6339bac92e58323165a7e74e5a89b456a0cab4ad127538d1`입니다.

2026-10-16 **13:32:40 KST(04:32:40Z)**에 `20261016-reverse-geocoding-1`을 배포했습니다. 신고 위치의 도로명 우선·지번 대체 조회에 300ms 대기, 실패·시간 초과 후 **주소 다시 조회**, 성공한 동일 좌표로 단계 재진입 시 중복 조회 방지·확인 유지, 수동 주소 보호를 적용했습니다. Frontend lint·빌드, SDK 대역 지도 테스트 **8개**, Linux 운영 빌드를 통과했습니다. **13:34:13.928 KST(04:34:13.928Z)** 실제 사이트에서 SDK 200, 주소 API 403 **2회(최초 1회·수동 재시도 1회)**를 확인했습니다. 좌표 유지·직접 입력은 정상이며 브라우저 오류·실제 GPS 요청·신고 제출은 없었습니다. **실제 자동 주소 조회는 미완료이고 403의 원인은 미확정입니다.** 인증 실패 callback은 없고 Referer는 운영 주소와 일치했습니다. 사용자가 네이버 콘솔 **Application Services → Maps → Application → 변경**에서 **Reverse Geocoding 선택**과 **Web 서비스 URL `https://15.165.235.154`**를 확인해야 합니다. 현재 Client ID는 변경하지 않았습니다. 같은 ID의 콘솔 서비스·URL 설정만 변경하면 재빌드는 필요 없고 새 ID로 바꾸면 Frontend 재빌드가 필요합니다. 관리자 신고 지도는 Reverse Geocoding을 호출하지 않습니다.

2026-10-16 **16:12:57 KST(07:12:57Z)**에 사용자가 변경한 공개 Client ID로 Frontend를 다시 빌드·배포했습니다. 당시 릴리스는 `20261016-reverse-geocoding-1`이며, 백업은 그 아래 `frontend/naver-backup-20261016-id-refresh-1`입니다. 업로드 아카이브 SHA-256 `cf3eb623b3dc72780cc882e715c4818898f41f4cc345c78b363e0e73c1205b51`을 EC2에서 확인했습니다. Backend·DB는 재시작하지 않았습니다. **16:13:11 KST**에 최초 조회·수동 재시도 모두 403이고 좌표 유지·직접 입력은 정상임을 확인했으며, **16:16:57 KST**에 새 ID로 SDK 200·지도 표시·타일 9개 로드를 별도로 확인했습니다. 실제 GPS 요청·신고 제출·브라우저 오류는 없었습니다. 주소 API는 상세 오류 내용을 반환하지 않아 원인이 미확정이며 새 ID의 동일 Application에서 Dynamic Map·Reverse Geocoding 선택과 Web 서비스 URL을 확인해야 합니다.

EC2 → Bedrock 직접 호출은 [최소 권한 JSON](iam-bedrock-report-policy.json)과 [관리자 설정 안내](iam-admin-setup.md)에 대안으로 정리했습니다. 기존 US Claude Haiku 4.5 프로필과 미국 3개 대상 리전의 모델만 범위에 포함했습니다. Bedrock 역할 정책 변경·AI 활성화는 수행하지 않았습니다. 2026-10-23 EC2 프로필 연결은 S3 저장을 위한 작업이며 Bedrock 호출 성공을 뜻하지 않습니다. 2026-10-22 재조회 시 로컬 AWS CLI의 로그인 자격증명 갱신이 실패했고 `signin:CreateOAuth2Token` 부족 가능성을 안내했습니다. 이는 모델 호출 권한 거부를 확인한 결과가 아니며, 앞서 성공한 Lambda·추론 프로필 조회 결과와 구분합니다.

## 3. 전용 DB·환경변수·사진 폴더 준비

실제 HTTPS Origin으로 아래 값을 교체합니다. 현재 EC2에는 `https://15.165.235.154`를 적용했습니다. 비밀번호나 AWS 값을 명령 인자로 넘기지 않습니다.

```bash
cd /srv/parkick/app
sudo bash deploy/configure-demo.sh https://parkick.example.com
```

스크립트가 서버 안에서 무작위 DB 비밀번호와 서로 독립적인 전화번호 키 두 개를 생성합니다. `parkick_app` 전용 계정과 `parkick` DB를 만들고 비밀번호 접속을 확인하며, 값을 출력하지 않고 `/etc/parkick/backend.env`에 저장합니다. 환경파일 권한은 `root:parkick 0640`입니다. 재실행할 때 기존 비밀번호·암호화 키·저장 모드를 바꾸지 않고, Origin 변경이나 기존의 알 수 없는 DB가 있으면 확인을 위해 중단합니다.

PostgreSQL은 localhost의 5432 포트와 비밀번호 인증을 사용합니다. 개발용 trust 인증과 55432 포트를 사용하지 않습니다. 신규 사진 폴더 `/var/lib/parkick/reports`는 `parkick:parkick 0700`이며 Nginx 정적 파일 경로 밖에 둡니다. [Ubuntu PostgreSQL 설치·구성 문서](https://ubuntu.com/server/docs/how-to/databases/install-postgresql/)

## 4. 유지할 운영 설정

`configure-demo.sh`가 아래 설정을 준비합니다. 이미 생성한 환경파일을 예제 파일로 덮어쓰지 않습니다.

```dotenv
NODE_ENV=production
HOST=127.0.0.1
FRONTEND_ORIGIN=https://parkick.example.com
ENABLE_DEV_ADMIN=false
TRUST_PROXY=loopback
REPORT_STORAGE_PROVIDER=local
REPORT_STORAGE_DIR=/var/lib/parkick/reports
AI_PROVIDER=disabled
```

위 설정은 초기 `local` 배포 예시입니다. 현재 운영은 `REPORT_STORAGE_PROVIDER=s3`, `AWS_REGION=ap-northeast-2`, `S3_REPORT_BUCKET=sgu-202686-s3`, `S3_REPORT_PREFIX=reports`를 사용하고 로컬 `REPORT_STORAGE_DIR`은 이전 사진의 복구·호환용으로 유지합니다. DB·S3 사진·전화번호 키는 다음 배포에서도 보존합니다. 키를 새로 만들면 기존 연락처 복호화·검색이 불가능해질 수 있으므로 함께 복구할 수 있도록 접근을 제한해 백업합니다. Bedrock은 별도로 활성화하며 운영에서 Mock AI나 개발 관리자 인증을 켜지 않습니다.

## 5. 마이그레이션과 최초 시연 데이터

DB 비밀번호가 포함된 환경변수를 셸 명령에 펼치지 않고 Node의 환경파일 옵션으로 읽습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx deploy/seed-demo.ts
```

`seed-demo.ts`는 `production`, 같은 호스트의 `parkick` DB, `parkick_app` 계정, `REPORT_REGION_CODE=local-development`를 확인합니다. 시연 기관·지역과 신고 유형 10개만 준비하며 재실행해도 같은 항목을 중복 생성하지 않습니다. 관리자 계정이나 가짜 신고는 만들지 않습니다.

### 플랫폼 관리자 최초 등록

DB 인증 수정본을 배포하고 Migration을 적용한 다음 `deploy/create-platform-admin.ts`로 플랫폼 관리자를 한 번 등록합니다. 입력은 `email`, `password`, `name` 세 필드의 JSON이며 비밀번호는 12~128자입니다. 이 JSON을 메모리에서 만든 파이프의 표준입력으로 전달하고, 비밀번호를 명령 인자·소스·셸 기록·로그에 남기지 않습니다. CLI는 직접 터미널 입력과 추가 명령 인자를 거부합니다.

표준입력을 받는 서버 명령은 다음과 같습니다. `/etc/parkick/backend.env`의 운영 DB 설정을 읽으며 `DEV_ADMIN_*`를 복사하지 않습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx deploy/create-platform-admin.ts
```

이 스크립트는 `127.0.0.1:5432/parkick`의 `parkick_app` 비밀번호 연결만 허용합니다. `PLATFORM_ADMIN`·소속 테넌트 없음으로 등록하고, 동일한 계정이 있으면 입력 일치를 확인합니다. 기존 비밀번호·이름·역할이 다르면 덮어쓰지 않습니다. 결과는 생성 여부와 역할만 출력합니다. 실제 EC2에서 지정 플랫폼 관리자 계정을 등록하고 로그인 검증을 완료했습니다. 현재 EC2 관리자 화면은 실제 DB 집계·신고 목록·상세·처리에 연결되어 있으며 운영 검증을 완료했습니다.

실제 관할을 도입할 때는 별도로 기관·지역을 등록하고 `REPORT_REGION_CODE`를 변경합니다. 개발용 `npm run setup:local`과 `npm run db:seed`는 운영 서버에서 실행하지 않습니다. SQL CHECK와 복합 FK를 포함하므로 스키마 적용은 `migrate deploy`를 사용합니다.

## 6. API 서비스 등록

```bash
cd /srv/parkick/app
sudo install -m 0644 deploy/parkick-api.service /etc/systemd/system/parkick-api.service
sudo systemd-analyze verify /etc/systemd/system/parkick-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now parkick-api
sudo systemctl status parkick-api --no-pager
curl --fail http://127.0.0.1:4000/api/health
curl --fail http://127.0.0.1:4000/api/reports/status
```

서비스는 `parkick` 사용자로 실행하며 앱 디렉터리는 실행 중 읽기 전용입니다. 사진을 포함한 `/var/lib/parkick`만 쓰기 가능하게 유지하고 `UMask=0077`을 적용합니다. API는 localhost에서만 수신합니다. 서비스 로그는 `journalctl -u parkick-api`에서 확인합니다. [systemd 실행 환경·보호 설정](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)

## 7. HTTPS와 Nginx

아래 도메인 예시와 IP 인증서 절차 중 실제 접속 주소에 맞는 방법을 사용합니다. 먼저 HTTP 임시 사이트를 준비하고 템플릿의 `server_name`을 실제 도메인 또는 IPv4로 바꿉니다.

```bash
cd /srv/parkick/app
sudo install -d -m 0755 /var/www/certbot
sudo install -m 0644 deploy/nginx-http-bootstrap.conf /etc/nginx/sites-available/parkick
sudoedit /etc/nginx/sites-available/parkick
sudo ln -s /etc/nginx/sites-available/parkick /etc/nginx/sites-enabled/parkick
sudo nginx -t
sudo systemctl enable --now nginx
```

Certbot을 설치하고 인증서를 발급합니다. 이미 Certbot이 설치된 서버에서는 기존 설치 방식을 유지합니다. `parkick.example.com`은 실제 도메인으로 변경합니다. 갱신 후 Nginx가 인증서를 다시 읽도록 deploy hook을 함께 저장합니다. [Certbot 공식 안내](https://certbot.eff.org/instructions?os=ubuntufocal&ws=nginx)

```bash
sudo apt-get install -y snapd
sudo snap install --classic certbot
sudo /snap/bin/certbot certonly --webroot -w /var/www/certbot -d parkick.example.com --deploy-hook "systemctl reload nginx"
```

인증서 발급 후 HTTPS 설정으로 교체합니다. 도메인과 `/etc/letsencrypt/live/도메인/` 경로를 모두 실제 값으로 맞춥니다.

```bash
cd /srv/parkick/app
sudo install -m 0644 deploy/nginx-parkick.conf /etc/nginx/sites-available/parkick
sudoedit /etc/nginx/sites-available/parkick
sudo nginx -t
sudo systemctl reload nginx
sudo /snap/bin/certbot renew --dry-run
```

Nginx는 `/api/` 경로를 보존하고 업로드 본문을 최대 40MiB까지 받습니다. `Origin`은 브라우저의 값을 유지하며 `X-Forwarded-For/Host/Proto`는 Nginx가 덮어씁니다. API의 `loopback` 신뢰 설정과 짝을 이루는 단일 프록시 구성입니다. 추후 로드밸런서·CDN을 앞에 두면 신뢰 범위를 다시 설계해야 합니다. [Nginx 프록시 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Express 프록시 신뢰 설정](https://expressjs.com/en/guide/behind-proxies/)

### 도메인이 없는 경우: 공인 IPv4 HTTPS

현재 서버는 이 방법으로 `15.165.235.154`의 인증서를 발급받았습니다. Certbot 5.4 이상은 webroot 방식의 IP 인증서를 지원하며, Let’s Encrypt IP 인증서는 약 6일 유효한 `shortlived` 프로필을 사용합니다. 자동 갱신과 Nginx 재적용을 함께 준비해야 합니다. [Let’s Encrypt 공식 IP 인증서 안내](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)

HTTP 임시 사이트에서 `server_name 15.165.235.154`와 `/var/www/certbot` ACME 경로를 먼저 적용합니다. 다음은 새 환경에서 검증 후 발급하는 예시이며, 이미 발급한 현재 서버에서 반복 발급할 필요는 없습니다. IP에는 `-d` 대신 `--ip-address`를 사용합니다.

```bash
sudo /snap/bin/certbot certonly --dry-run --preferred-profile shortlived \
  --webroot -w /var/www/certbot --ip-address 15.165.235.154
sudo /snap/bin/certbot certonly --preferred-profile shortlived \
  --webroot -w /var/www/certbot --ip-address 15.165.235.154 \
  --cert-name 15.165.235.154 --deploy-hook "systemctl reload nginx"
```

검증용 인증서는 공개 서비스에 적용하지 않습니다. 실제 발급 후 Nginx 템플릿의 도메인·리다이렉트·프록시 Host를 모두 해당 IP로 바꾸고, 인증서 경로를 `/etc/letsencrypt/live/15.165.235.154/fullchain.pem`과 `privkey.pem`으로 맞춥니다. `FRONTEND_ORIGIN`도 `https://15.165.235.154`로 일치시킵니다. 기존 환경파일에서는 이 Origin만 수정하고 DB 비밀번호·전화번호 키는 유지합니다.

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart parkick-api
sudo systemctl is-active snap.certbot.renew.timer
sudo /snap/bin/certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

`--dry-run`은 staging에서 갱신을 검사하고 `--run-deploy-hooks`는 성공 시 현재 운영 인증서로 reload hook을 검사합니다. 현재 서버에서 위 명령이 종료 코드 0으로 완료됐고 `Congratulations, all simulated renewals succeeded` 로그를 확인했습니다. 타이머도 활성화되어 있습니다. [Certbot 갱신·hook 문서](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

현재 공인 IP는 Elastic IP로 고정하지 않았습니다. EC2를 중지 후 시작하면 주소가 바뀔 수 있어 새 IP의 인증서, Nginx와 `FRONTEND_ORIGIN`을 다시 준비해야 합니다. 재부팅과 중지·시작은 구분합니다. [AWS EC2 중지·시작 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Stop_Start.html)

## 8. 배포 확인과 재배포

```bash
curl --fail https://15.165.235.154/api/health
curl --fail https://15.165.235.154/api/reports/status
```

`reports/status`가 `mode: "local"`이고 접수 가능한 상태인지 확인합니다. 디렉터리 권한과 실행 계정의 쓰기 권한도 확인합니다.

```bash
sudo stat -c '%U:%G %a %n' /var/lib/parkick/reports
sudo -u parkick test -w /var/lib/parkick/reports
```

`health`의 `configured`와 `reports/status`의 `available`만으로 실제 저장 성공이 검증되지는 않습니다. 개인정보 없는 사진으로 신고를 제출하고 PostgreSQL의 접수번호와 비공개 사진 파일이 남는지 확인합니다. `available`은 신고 준비 상태이며 시민 신고내역 조회 API가 아닙니다. 사진 경로는 공개 페이지로 노출하지 않습니다.

Phase 5에는 `POST /api/reports/lookup`과 `POST /api/reports/lookup/:publicId`를 추가했습니다. 목록은 JSON 본문의 `phone`과 선택 `page`(기본 1, 최대 1000)를 받고 20건씩 `hasMore`와 함께 반환합니다. 상세는 본문에 `phone`만 받습니다. 두 경로는 IP별 합산 분당 20회 제한을 공유하고 `no-store`를 적용합니다. 공개 응답에는 신고번호·시각·업체·유형·상태·완료 방식과 공개 처리 이력만 포함하며 신고 본문·사진·GPS·주소·전화번호/HMAC·내부 메모는 포함하지 않습니다. 전체 계약은 [프로젝트 조회 설명](../README.md#15-전화번호-기반-처리결과-조회-구조)에 있습니다.

2026-10-15 당시 배포본은 모바일 Chrome 390px에서 6단계 신고·201 접수·완료 영수증·번호 목록 200/no-store·상세 처리 이력까지 통과했습니다. 이는 새 5단계 사진 판별 릴리스의 실사이트 검증이 아닙니다. 번호 없는 신고는 전화번호 조회에 포함되지 않습니다. 기존 DB와 전화번호 키를 그대로 사용하며 OTP·SMS·인증 서비스는 준비하지 않습니다.

`/`, `/report`를 직접 열고 새로고침했을 때 SPA가 동작하는지, 모바일 HTTPS에서 카메라·위치 권한을 사용할 수 있는지 확인합니다. 관리자 인증은 등록한 운영 계정의 로그인·새로고침 시 세션 복원·로그아웃 후 접근 거부를 확인합니다. 개발 `DEV_ADMIN_*` 계정은 운영 성공 조건으로 사용하지 않습니다. 현재 실제 EC2에서 DB 인증 모드와 쿠키 속성, 세션 복원·로그아웃 후 기존 토큰의 401 응답을 모두 확인했습니다.

재배포는 `/etc/parkick/backend.env`, PostgreSQL 데이터, S3 객체와 `/var/lib/parkick/reports` 원본을 유지하고 `/srv/parkick/releases/릴리스명`에서 설치·운영 빌드를 준비한 뒤 `/srv/parkick/app` 연결 대상을 전환하고 API를 재시작하는 방식입니다. 현재 배포 대상은 `20261103-staff-roles-1`이며 이전 대상 `20261025-hotspot-circles-1`, `20261025-admin-hotspots-1`, `20261025-chatbot-1`, `20261025-live-photo-guidance-1`, `20261025-collection-field-1`, `20261025-admin-rejected-1`, `20261025-admin-top-nav-1`, `20261025-admin-list-focus-1`, `20261025-admin-sidebar-1`, `20261025-admin-collection-mode-1`, `20261024-admin-collect-area-1`, `20261024-mobile-steps-7`, `20261024-mobile-steps-6`, `20261024-mobile-steps-5`, `20261024-mobile-steps-4`, `20261024-mobile-steps-3`, `20261024-mobile-steps-2`, `20261024-mobile-steps-1`, `20261024-photo-two-1`, `20261024-report-title-1`, `20261023-photo-copy-1`, `20261023-litellm-photo-1`과 S3 호환 대상 `20261023-s3-hybrid-ready-1`을 보존했습니다. 2026-10-23 S3 이전 직전 백업은 `/var/backups/parkick/s3-cutover-20261023-1`에 검증해 두었습니다. DB 마이그레이션 전에는 DB·사진·전화번호 키를 복구할 수 있는 백업을 확보합니다. 새 S3 사진이 생긴 뒤 로컬 전용 릴리스로 돌아가면 사진을 읽지 못하므로 S3 호환 릴리스를 롤백 대상으로 사용합니다.

2026-10-23 `20261023-photo-copy-1`에서는 현장사진 단계의 안내 문구 세 곳만 삭제했습니다. 프런트엔드 lint·빌드·10개 테스트가 통과했고, 운영 모바일 크기 브라우저에서 사진 촬영·갤러리 버튼과 문구 제거를 확인했습니다. API health의 `photoValidation=litellm`, `storage=private-s3` 상태도 유지됩니다. 실제 신고 제출은 실행하지 않았습니다.

2026-10-24 `20261024-report-title-1`에서는 신고 단계마다 보이던 `PARKICK REPORT / 공유 킥보드 신고` 제목 영역을 제거하고 단계 표시 위 여백을 줄였습니다. 접근성용 제목과 각 단계의 제목은 유지했습니다. 프런트엔드 lint·빌드·10개 테스트를 통과했고, 운영 모바일 크기 브라우저에서 제목 영역이 사라지고 첫 단계 카드가 약 104px 위로 이동한 것을 확인했습니다. API health의 `photoValidation=litellm`, `storage=private-s3` 상태도 유지됩니다. 실제 신고 제출은 실행하지 않았습니다.

2026-10-24 `20261024-photo-two-1`에서는 신규 신고의 현장사진을 최대 2장으로 제한하고, 현장사진 단계에 3미터 거리의 기기 전체 촬영·행인 얼굴과 차량번호판 주의 안내를 작게 배치했습니다. 기존 3장 신고의 세 번째 S3 사진은 계속 조회·정리할 수 있습니다. Backend 155개 테스트와 Frontend lint·빌드·10개 테스트, 집중 브라우저 테스트 2개를 통과했습니다. 운영 HTTPS 모바일 390×844에서 사진 1장·2장 모두 다음 단계 버튼이 화면 안에 있고, 세 번째 사진은 서버가 HTTP 400으로 거부하는 것을 확인했습니다. 시험 신고는 생성하지 않았습니다.

2026-10-24 `20261024-mobile-steps-1`은 QR 확인·위치 확인·신고 유형 단계의 모바일 세로 여백을 줄여 EC2에 반영했습니다. 위치 단계는 기기 GPS 자동 확인과 NAVER 주소 조회·핀 이동·현재 위치 다시 확인·위치 확인란을 유지하고, 정상 상태에서는 좌표·정확도 카드와 수동 좌표 요약을 표시하지 않습니다. GPS 거부, 지도 SDK 연결·렌더링 실패 시에는 수동 좌표 입력을 사용할 수 있습니다. 로컬 지도 SDK 대역 브라우저 테스트 10개가 모두 통과 출력됐으며 정상 GPS와 주소 조회가 끝난 390×844 화면에서 다음 단계 버튼이 화면 안에 있었습니다. Windows Playwright 종료 과정은 테스트 출력 후 수동 중단했습니다. 높이 667px 화면은 추가 조정이 필요해 `20261024-mobile-steps-2`를 준비했습니다.

`20261024-mobile-steps-2` 배포 전 운영 브라우저에 추가 CSS를 주입해 스크롤 위치 0에서 다음 버튼 하단을 측정했습니다. 390×844에서는 QR 기본/수동 797/744px, 위치 813px, 유형 일반/기타 658/756px였고, 390×667에서는 QR 기본/수동 588/619px, 위치 618px, 유형 일반/기타 540/628px였습니다. 모두 해당 화면 높이 안에 들어왔으며, 정상 위치 화면의 좌표 카드와 수동 입력 요약은 보이지 않았습니다. 이 수치는 CSS 주입 검사이며 새 릴리스 빌드가 실제 배포된 결과는 아닙니다. 신고 제출은 실행하지 않았습니다.

이후 `20261024-mobile-steps-2`를 EC2에서 활성화하고 API health의 `photoValidation=litellm`, `storage=private-s3`를 확인했습니다. 새 빌드의 모바일 화면 실측은 별도로 검증합니다.

`20261024-mobile-steps-3`은 모바일에서 단계 이동 후 제목 초점과 화면 상단 위치를 함께 맞춥니다. EC2에서 활성화한 새 빌드의 실제 HTTPS 브라우저 검사에서는 모든 단계 전환 직전 스크롤 위치가 0이었습니다. 390×844 화면에서 다음 버튼 하단은 QR 기본/수동 797/744px, 위치 793px, 유형 일반/기타 658/756px였고, 390×667 화면에서는 각각 588/619px, 608px, 553/641px였습니다. 두 화면 크기에서 버튼이 스크롤 없이 보이고 가로 넘침은 없었습니다. 정상 위치 단계의 지도는 표시됐으며 좌표 카드·수동 좌표 입력은 보이지 않았습니다. API health는 `photoValidation=litellm`, `storage=private-s3`였고 시험 신고는 생성하지 않았습니다.

`20261024-mobile-steps-4`는 짧은 화면에서 QR 단계의 업체 선택과 기타 업체명 입력을 한 줄에 배치합니다. 새 빌드를 활성화한 뒤 CSS 주입 없이 실제 HTTPS 브라우저에서 단계 전환 전 스크롤 위치 0, 가로 넘침 없음을 확인했습니다. 390×844 다음 버튼 하단은 QR 기본/수동/기타 업체 797/744/839px, 위치 793px, 신고 유형 일반/기타 658/756px였습니다. 390×667에서는 QR 기본/수동/기타 업체 588/619/619px, 위치 608px, 신고 유형 일반/기타 553/641px로 모두 화면 안에 있었습니다. 위치 단계의 지도는 보이고 정상 상태의 좌표 카드·수동 좌표 입력은 보이지 않았습니다. API health는 `photoValidation=litellm`, `storage=private-s3`이며 시험 신고는 생성하지 않았습니다.

`20261024-mobile-steps-5`는 QR 단계의 기타 업체 두 열 배치를 모든 모바일 높이에서 사용합니다. EC2에서 활성화한 빌드를 실제 HTTPS 브라우저로 CSS 주입 없이 확인했습니다. 390×844에서 다음 버튼 하단은 QR 기본/수동/기타 업체 797/744/817px, 위치 793px, 신고 유형 일반/기타 658/756px이고, 390×667에서는 각각 588/619/619px, 608px, 553/641px였습니다. 단계 전환 전 스크롤 위치는 0이고 가로 넘침이 없으며, 정상 위치 단계에서는 지도만 보이고 좌표 카드·수동 좌표 입력은 숨겨졌습니다. API health는 `photoValidation=litellm`, `storage=private-s3`였고 시험 신고는 생성하지 않았습니다.

`20261024-mobile-steps-6`은 모바일 신고 화면의 푸터·중복 문구·아래 여백을 줄인 중간 릴리스입니다. 실제 390×844 화면에서 CSS 적용 순서 때문에 아래 여백 38px이 남아 문서 높이가 853px인 것을 확인했습니다. `20261024-mobile-steps-7`에서 선택자 우선순위를 바로잡은 뒤 실제 HTTPS 브라우저를 CSS 주입 없이 검사했습니다. 390×844와 390×667 모두 QR 기본/수동/기타 업체, 정상 GPS 위치, 신고 유형 일반/기타 화면에서 **문서 높이가 화면 높이와 같고** 전환 전 스크롤 위치는 0이며 가로 넘침이 없었습니다. 다음 버튼 하단은 390×844에서 QR 797/744/817px, 위치 793px, 신고 유형 658/756px였고 390×667에서 QR 588/619/619px, 위치 608px, 신고 유형 553/641px로 화면 안에 있었습니다. 정상 위치 화면의 지도는 보이고 좌표 카드·수동 좌표 입력은 숨겨졌습니다. API health는 `photoValidation=litellm`, `storage=private-s3`였으며 시험 신고는 생성하지 않았습니다.

설정을 변경할 때는 실제 Ubuntu 호스트의 `nginx -t`·`systemd-analyze verify`로 확인합니다. 현재 외부 API 접수·재시도와 모바일 Chrome 초기 흐름·갱신 검사는 통과했습니다. 모바일 화면 설정의 브라우저 검사는 실제 휴대전화 카메라·GPS·전체 현장 신고 검증과 구분합니다.

## 9. 사진을 S3로 전환

S3 어댑터와 비공개 버킷 `sgu-202686-s3`를 운영에 적용했습니다. 개발 PC 로그인 프로필 `parkick`(IAM 사용자 `sgu-202686`)과 EC2에 연결한 `SafeInstanceProfile-sgu-202686` 역할에서 각각 임시 객체 쓰기·읽기·내용 비교·삭제를 확인했습니다. EC2 SDK는 역할의 임시 자격증명을 사용하며 개발 PC의 프로파일·로그인 캐시·장기 키를 서버에 복사하지 않았습니다. 연결된 프로필의 association ID는 `iip-assoc-0a7d3a8136ba4ba4b`이며 상태는 `associated`입니다. [AWS EC2 IAM 역할 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)

S3 공개 차단·Bucket owner enforced·SSE-S3를 유지합니다. Parkick의 최소 필요 권한은 `reports/*`의 `PutObject`, `GetObject`, `DeleteObject`이며, 연결 검사에서 이 세 작업이 실제 성공했습니다. 기존 역할의 전체 유효 정책은 조회 제한으로 확인하지 못했으므로 권한이 이 범위에만 제한됐다고 단정하지 않습니다. 버저닝을 사용할 경우 버전 지정 조회·삭제에는 `GetObjectVersion`, `DeleteObjectVersion` 권한도 필요합니다. `HeadBucket`은 버킷 목록 권한을 요구하므로 연결 확인에 사용하지 않습니다. [S3 권한 범위](https://docs.aws.amazon.com/us_en/AmazonS3/latest/userguide/access-policy-language-overview.html), [HeadBucket 권한](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html)

서버에서 다음 검사를 실행해 `reports/` 아래 임시 객체를 생성·조회·삭제했습니다. 설정 변경 후 권한을 재확인할 때 같은 명령을 사용할 수 있습니다.

```bash
cd /srv/parkick/app
sudo -u parkick env REPORT_STORAGE_PROVIDER=s3 AWS_REGION=ap-northeast-2 S3_REPORT_BUCKET=sgu-202686-s3 S3_REPORT_PREFIX=reports \
  node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-aws.ts
```

2026-10-23 S3 전환 직전 DB 사진 6장(총 12,195,775바이트)은 모두 로컬 파일의 크기·SHA-256과 일치했습니다. `/var/backups/parkick/s3-cutover-20261023-1`에 운영 환경파일·DB dump·사진 tar를 백업해 확인한 뒤 S3로 업로드·검증하고 DB 경로를 한 트랜잭션으로 변경했습니다. 이전 도구 `backend/scripts/migrate-local-evidence.ts`의 `--verify`는 6장 통과, 이후 `--dry-run`의 미이전 사진은 0장이었습니다. 별도 사후 검사에서 실제 6장을 `S3EvidenceStorage` 서명 URL로 각각 GET해 다운로드 크기와 SHA-256이 DB 메타데이터와 전부 일치함을 확인했습니다. 원본 파일과 manifest `/var/lib/parkick/evidence-migration-20261023.json`을 보존했습니다. 합성 이미지에 대한 애플리케이션 S3 어댑터 업로드·서명 URL GET·SHA-256 비교·삭제도 통과했습니다. 운영 관리자·시민 브라우저에서의 실제 사진 화면과 신규 신고는 아직 별도 검증이 필요합니다.

운영 환경파일은 `REPORT_STORAGE_DIR=/var/lib/parkick/reports`를 복구용으로 유지하면서 `REPORT_STORAGE_PROVIDER=s3`, `AWS_REGION=ap-northeast-2`, `S3_REPORT_BUCKET=sgu-202686-s3`, `S3_REPORT_PREFIX=reports`로 설정했습니다. API 재시작 후 `/api/health`는 `private-s3`, `/api/reports/status`는 `available=true`였습니다. 새 사진은 S3에 쓰고, 이전 사진도 DB의 S3 키로 조회합니다. 브라우저는 백엔드를 통해 업로드하므로 S3 CORS는 필요하지 않습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/migrate-local-evidence.ts --dry-run
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/migrate-local-evidence.ts --verify --manifest /var/lib/parkick/evidence-migration-20261023.json
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/migrate-local-evidence.ts --dry-run
```

이 도구는 DB에 기록된 로컬 사진의 크기·해시와 S3에서 다시 읽은 내용을 확인한 뒤 DB 경로를 한 번에 변경했습니다. `--rollback --manifest <같은 절대경로>`는 보존한 로컬 원본을 재검증하고 DB 경로만 되돌리며 S3 사본은 삭제하지 않습니다. 원본과 manifest는 조회·복구 확인 전까지 보존합니다. 새 S3 신고가 생긴 뒤에는 로컬 전용 구 릴리스로 코드만 되돌리면 그 사진을 읽을 수 없으므로 S3 호환 릴리스를 롤백 대상으로 사용합니다. 이 검사는 객체 목록 권한(`s3:ListBucket`) 없이 지정된 키의 쓰기·읽기·삭제만 사용합니다.

## 10. 내부 LiteLLM 프록시 현장 사진 판별

제공된 내부 API는 `https://52.78.77.90`에서 유효한 TLS 인증서를 제공하며 LiteLLM 1.102.0 Swagger를 노출합니다. 인증된 `GET /v1/models`에서 `bedrock-haiku`, `bedrock-sonnet`, `bedrock-gpt-5.6-luna`를 확인했습니다. 합성 사과 JPEG를 `bedrock-haiku`로 `POST /v1/chat/completions`에 보낸 시험은 HTTP 200과 무관 사진이라는 JSON 판정을 반환했습니다. 첫 운영 양성 사전 검사에서 모델이 완전한 JSON 코드 블록 뒤에 설명 문장을 덧붙여 503이 발생했습니다. 응답 해석을 보완하고 회귀 검사를 추가한 뒤 같은 외부 HTTPS 사전 검사에서 공유 킥보드 사진 200·`valid=true`, 무관 JPEG 422·`PHOTO_NOT_PM`을 확인했습니다. 로컬 백엔드 테스트 153개·TypeScript·ESLint, 프런트엔드 빌드·lint·테스트 10개와 EC2 릴리스의 프런트엔드·백엔드 빌드·백엔드 테스트 143개가 통과했습니다. 최종 신고 제출·실제 휴대전화 흐름은 아직 검증하지 않았습니다.

양성 시험에는 [Wikimedia Commons의 공개 공유 킥보드 사진](https://commons.wikimedia.org/wiki/File:Shared_electric_kick_scooters_in_Tomasz%C3%B3w_Mazowiecki,_Poland.jpg)을 사용했고, 음성 시험은 생성한 무관한 JPEG를 사용했습니다. 두 검사 모두 최종 신고를 만들지 않았습니다.

운영 EC2의 접근 제한된 `/etc/parkick/backend.env`에 아래 구성을 적용했습니다. 백엔드는 `x-litellm-api-key` 헤더로 프록시를 인증합니다. 제공된 키는 이 환경파일에 `root:parkick`, 권한 `0640`으로 보관하며 실제 값은 소스·문서·배포 로그·Frontend 환경변수에 기록하지 않습니다.

```dotenv
AI_PROVIDER=litellm
LLM_API_BASE_URL=https://52.78.77.90
LLM_API_KEY=<서버의 비공개 환경파일에만 설정>
LLM_REPORT_MODEL_ID=bedrock-haiku
```

`litellm` 모드에서는 EC2 백엔드가 HTTPS 프록시에 정제한 이미지 요청을 보냅니다. 프록시 뒤의 Bedrock 모델 호출은 프록시 측에서 처리하므로 Parkick EC2 역할에 직접 `bedrock:InvokeModel` 권한을 추가하지 않았습니다. 현재 역할의 S3 저장 권한과 서울 `AWS_REGION=ap-northeast-2` 설정은 그대로 사용합니다. 외부 HTTPS의 사전 사진 검사는 통과했으며 최종 `POST /api/reports`의 실제 제출·재시도와 운영 브라우저 사진 조회는 남아 있습니다. 이번 검사는 실제 신고를 생성하지 않았습니다.

## 11. 기존 대안: Bedrock 직접 현장 사진 판별

아래 직접 Bedrock 호출 절차는 내부 LiteLLM 프록시 대신 EC2에서 AWS 모델을 직접 호출하기로 별도 결정할 때의 대안입니다. EC2 역할의 모델 권한과 직접 이미지 호출은 검증되지 않았습니다. 현재 운영 사진 판별은 `AI_PROVIDER=litellm`입니다.

새 5단계 소스는 현장 사진 단계의 `POST /api/reports/validate-photos`와 최종 `POST /api/reports`에서 사진을 검사합니다. `AI_PROVIDER=disabled`이면 사진 형식·크기만 검사하고 신규 신고를 접수합니다. 현재 `litellm` 경로에도 EC2의 직접 Bedrock 권한은 필요하지 않지만 S3 사진 저장에는 연결된 EC2 역할이 필요합니다. 직접 `bedrock`을 활성화하면 두 시점에 이미지 내용을 판별하고 무관한 사진의 재첨부를 안내합니다. 이때 모델 오류·시간 초과·권한 거부 시에는 접수를 막습니다. 운영 `mock`은 허용하지 않습니다. 직접 호출용 모델 권한과 실제 이미지 호출을 검증한 뒤에만 해당 대안으로 전환합니다.

`BEDROCK_REGION`은 직접 Bedrock 호출용 AI 리전이며 비워 두면 `AWS_REGION`을 사용합니다. 현재 신고 사진 저장은 S3이고 사진 판별은 `AI_PROVIDER=litellm`입니다. 향후 직접 Bedrock 대안을 선택할 경우 판별용으로 정제·축소한 JPEG만 `us-east-1`의 `us.anthropic.claude-haiku-4-5-20251001-v1:0` Converse 프로필에 보냅니다. 이 US 프로필은 미국 내 `us-east-1`·`us-east-2`·`us-west-2`로 라우팅될 수 있습니다. 전화번호·QR 원문·위치 좌표는 모델 요청에 포함하지 않습니다. [Haiku 4.5의 이미지·Converse 지원](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html), [Converse 이미지 요청](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)

**2026-10-22 운영 EC2의 과거 상태:** 당시 `parkick-api`는 `AI_PROVIDER=disabled`, `AWS_REGION` 빈 값, `BEDROCK_REGION` 미설정이었고 IMDSv2 `iam/info`는 404였습니다. 2026-10-23에는 기존 프로필을 연결해 S3를 활성화했고 이후 LiteLLM 사진 판별을 배포했습니다. EC2에서 직접 Bedrock 이미지 호출은 시험하지 않았습니다. 개발 PC의 키·로그인 캐시는 서버에 복사하지 않았습니다. 기존 [S3 역할 정책](iam-s3-reports-policy.json)은 Bedrock 호출을 허용하지 않습니다.

Lambda는 필요하지 않으며 새 사진 판별 서비스는 EC2에서 Bedrock을 직접 호출하도록 작성했습니다. 이 호출에는 추론 프로필과 대상 리전의 모델 ARN에 `bedrock:InvokeModel` 권한이 필요합니다. [추론 프로필 권한 조건](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html)

기존 챗봇 함수의 **2026-10-16 당시** 확인 결과는 다음과 같습니다. 사진 판별 호출의 성공 여부를 뜻하지 않습니다.

| 항목 | 2026-10-16 확인 결과 |
| --- | --- |
| 함수 | 서울 `sgu-202686-bedrock`, Active, Python 3.14·x86_64·128MB·제한 시간 60초, VPC 연결 없음·Function URL 없음 |
| 실행 역할 | `SafeRole-sgu-202686`; `Shingu-AllowBedrockInvoke` 정책 연결 확인 |
| 호출 권한 검사 | 로컬 사용자로 `Invoke`의 `DryRun` 204 통과; 실제 함수 실행은 0회이며 EC2의 호출 권한을 뜻하지 않음 |
| 코드 | `prompt`·`session_id` 입력 → 서울 DynamoDB 대화 이력 조회·사용자 메시지 저장 → Bedrock Converse → 응답 메시지 저장 |
| Bedrock | 클라이언트 `us-east-1`, `us.anthropic.claude-haiku-4-5-20251001-v1:0` 추론 프로필 ACTIVE |
| 추론 대상 리전 | `us-east-1`·`us-east-2`·`us-west-2`; 버지니아에 한정되지 않음 |
| 미확인 권한 | `GetPolicyVersion`·`GetRole`·`GetRolePolicy`·`SimulatePrincipalPolicy` 제한으로 정책 본문·신뢰 정책·유효 권한 미확인; 실제 Bedrock 모델 호출 0회 |

기존 Lambda는 DynamoDB 대화 이력을 저장하는 챗봇 함수여서 현장 사진 판별에 사용하지 않습니다. 로컬 Lambda DryRun 성공과 추론 프로필 ACTIVE만으로 EC2의 직접 이미지 호출 성공을 판단할 수 없습니다. 2026-10-23에 EC2 인스턴스 프로필을 S3 저장용으로 연결했지만 Lambda·역할 정책은 변경하지 않았습니다. 운영 사진 판별은 LiteLLM 프록시 경로를 사용합니다.

사진 판별 모델은 프로젝트 루트에서 `npm run aws:check:photo --workspace backend`로 검사합니다. `backend/.env`에 `BEDROCK_REGION=us-east-1`, `BEDROCK_REPORT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0`과 유효한 로컬 AWS 인증을 설정해야 합니다. 스크립트는 생성한 사과 JPEG만 보내고 **`PHOTO_NOT_PM` 판정이 나오면 성공**으로 처리합니다. 실제 신고 사진이나 연락처는 읽지 않으며 소량의 모델 호출 요금이 발생할 수 있습니다.

```bash
npm run aws:check:photo --workspace backend
```

운영 EC2에서는 역할 연결과 운영 환경파일 설정 뒤 같은 스크립트를 `parkick` 서비스 계정으로 실행해 실제 역할 자격증명을 검사합니다. 이 검사는 운영 모델을 한 번 호출하므로 준비되기 전에는 실행하지 않습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-photo-validation.ts
```

합성 사과 한 장의 거부 성공만으로 킥보드·자전거 사진의 허용 품질이나 최종 접수 성공을 입증할 수 없습니다. 개인정보 없는 현장 시험 사진으로 사전 확인과 최종 제출을 별도로 검증해야 합니다. 기존 텍스트 연결 검사 CLI는 아래처럼 합성 문구를 Amazon 기본 모델에 보낼 뿐 **사진 판별용 Claude 추론 프로필은 검사하지 못합니다.** 이전 문서의 `amazon.nova-micro-v1:0`은 [이미지 입력을 지원하지 않는 텍스트 전용 모델](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-micro.html)이므로 사진 판별 모델 ID로 사용하면 안 됩니다.

```bash
node --import tsx backend/scripts/check-bedrock.ts
```

기존 텍스트 CLI는 실제 신고·개인정보 대신 고정 합성 문구만 전송하며 최대 출력 16토큰·15초 제한·재시도 없이 소량의 모델 요금이 발생할 수 있습니다. [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)의 IAM 권한 이름은 `bedrock:InvokeModel`입니다. 이 직접 호출 경로는 모델·역할 검증 전까지 비활성화하며 운영 사진 판별은 LiteLLM 프록시를 사용합니다.

2026-10-16 18:17:54 KST 안내 문구까지 업체 선택으로 통일한 최종 릴리스 `20261016-operator-selection-2`를 배포했습니다. SHA-256 `675b4af4a03cf97fcac46efb0182ab7cdd7dbba87b2af7ff335db917613bbe5a`. 18:18:25 KST 실제 모바일 화면에서 최종 안내·카카오 실물 QR 자동 선택·수동 변경 확인을 통과했습니다. 기존 업체명 정리와 백업은 유지하며 추가 데이터 수정은 없었습니다.

2026-10-16 **22:48:29 KST(13:48:29Z)** 관련 신고·QR 보완 릴리스 `20261016-related-qr-1`을 배포했습니다. 소스 SHA-256은 `6ca8ecb0194d82fd52ceb21b1b686c0826977a93eead87e8b2bbed2e0c5b2941`입니다. 같은 테넌트·지역·업체·기기번호의 미완료 신고를 현재 신고 기준 100m·전후 24시간 안에서 후보로 제시하고, 중간 완료 기록으로 새 사건을 구분합니다. 관리자가 직접 선택한 신고만 수거/견인 완료하며 각 접수번호와 개별 이력을 보존합니다. 빔 영문·숫자 QR, 빔 선택 후 5자리 숫자 입력, 지쿠 `08201`+6자리 번호와 사진 축소·명암 보정을 지원합니다. 수동 수정은 진행 중인 사진·카메라 판독과 해석 응답을 취소합니다.

2026-10-18 **18:10 KST(09:10Z)** `20261018-auto-gps-qr-1`을 배포했습니다. 소스 SHA-256은 `537aa706d8768360721dc945bc5a8fd6e1a625756d53e59104c01c84f158b646`입니다. 위치 단계에서 사진 EXIF 대신 기기 GPS를 자동 요청하고 네이버 주소를 조회하며, 버튼으로 재확인할 수 있습니다. 스윙·알파카·쏘카 일레클의 확인된 QR 문자열도 해석합니다. 18:13 KST 실제 HTTPS 모바일 화면에서 개발용 안내 문구 제거, 모의 GPS 좌표 자동 표시, NAVER 도로명주소 반환, 새 QR 해석 API 3건을 확인했습니다. 신고 제출은 하지 않았고 기존 DB·사진·운영 환경파일을 유지했습니다.

2026-10-19 **16:11 KST(07:11Z)** `20261019-demo-label-1`을 배포했습니다. 이전 릴리스를 복제해 변경된 관리자 목록 소스·Frontend 빌드·시연 seed만 교체했습니다. 시연용 기관과 지역의 DB 이름을 모두 `개발용 (시연 데이터)`로 바꾸고 목록에서는 같은 이름을 한 번만 표시합니다. 요청한 `PK-20261017-32396d122d0a`의 DB 신고·연결 행과 사진 1개·전용 디렉터리를 삭제했습니다. 접수번호와 내부 UUID·사진 경로를 대조한 후 처리했으며 DB·파일 부재와 다른 신고 4건 보존을 확인했습니다. Frontend 빌드·전체 린트, HTTPS 정적 파일 200, API health와 서비스 active를 확인했습니다. 스키마와 운영 환경파일은 변경하지 않았습니다.

**과거 배포 기록:** 2026-10-21 **23:59 KST(14:59Z)** `20261021-qr-step-1`을 배포했습니다. 당시에는 QR 단계 체크박스 두 개를 제거하면서 기기번호를 선택 입력으로 바꿨고, 번호 없이 다음 단계로 가는 동작을 실사이트에서 확인했습니다. 2026-10-22 릴리스에서는 업체·기기번호를 모두 필수로 바꿨습니다. 당시 로컬 Frontend lint·빌드, 브라우저 검사를 수행했고 API health·서비스 active·JS 응답을 확인했습니다. 운영 신고 생성이나 사진 업로드는 하지 않았습니다.

Backend 단위/API **127개**, 전용 PostgreSQL/API **14개**, 전체 브라우저 **39개**, 실제 DB 관리자 브라우저 **4개**를 통과했습니다. Frontend/Backend lint·타입 검사와 Frontend 빌드를 통과했습니다. 로컬 Backend 전체 빌드의 Prisma DLL 교체는 Windows 파일 잠금(EPERM)으로 실패했으나, EC2 새 폴더에서 `npm ci`·Prisma 생성·전체 운영 빌드·API·접수 준비 검사는 통과했습니다. **22:48:54 KST** 실제 사이트에서 사용자 빔 2장·지쿠·카카오 원본 사진, 기존 신고 6건의 관련 조회와 브라우저 합성 후보의 명시적 선택·확인창 취소를 확인했습니다. 실제 일괄 저장·충돌·재시도는 전용 로컬 DB에서 검증했습니다. 운영 신고 생성/완료·사진 업로드·QR 목적지 방문·브라우저 오류는 0회입니다. 이전 릴리스·DB·사진·공개 지도 설정을 보존했고 스키마 변경이나 업체명 추가 정리는 하지 않았습니다.
