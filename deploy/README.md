# EC2 한 대에 웹·API·PostgreSQL·비공개 사진 배포

초기에는 Ubuntu EC2 한 대에서 Nginx, Node.js 22, PostgreSQL을 실행하고 사진도 같은 서버의 비공개 폴더 `/var/lib/parkick/reports`에 저장합니다. Nginx가 HTTPS와 React 정적 파일을 제공하고 `/api/`를 `127.0.0.1:4000`으로 전달합니다. 사진 폴더는 정적 웹 경로에 포함하지 않습니다. S3 전환은 후속 선택 사항이며 현재 배포에 S3 접근용 IAM 역할은 필요하지 않습니다.

**2026-10-15 현재 초기 EC2 웹·API·PostgreSQL·비공개 사진 폴더·IP HTTPS 배포를 완료했습니다.** 주소는 **[https://15.165.235.154](https://15.165.235.154)**입니다. 외부 HTTPS·API 접수·중복 재시도 검사 6개, 모바일 Chrome 초기 신고 흐름 검사 5개와 인증서 갱신 dry-run·Nginx 재적용 hook 검사를 통과했습니다. 아래에는 실제 적용한 구성과 같은 방식으로 준비하는 절차를 정리합니다.

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
| 사진 저장 | EC2의 `/var/lib/parkick/reports`, `parkick:parkick` 소유·폴더 0700/파일 0600 권한; 개발 PC는 기존 `backend/data/reports` 사용 |
| S3 | `sgu-202686-s3`는 향후 전환용으로 보존; 퍼블릭 액세스 차단 네 항목 활성화, Bucket owner enforced, SSE-S3(AES256) |
| 실제 검증 | 개발 PC의 `npm.cmd run aws:check`로 `reports/` 아래 테스트 JPEG 쓰기·읽기·바이트 비교·삭제 통과 |
| 설치·빌드 | Node 22.23.3·PostgreSQL 16·Nginx, `npm ci`·Frontend/Backend 운영 빌드·Migration·시연 seed 성공 |
| 실행 상태 | API·Nginx·PostgreSQL 활성화; production·DB configured·private-local, 접수 상태 available=true·local, 사진 디렉터리 0700 |
| HTTPS | Certbot snap 5.8.0, Let’s Encrypt shortlived IPv4 인증서 발급·Nginx 적용; 발급자 YE2, 확인 당시 만료 2026-10-22 11:45:26 KST |
| 갱신 | `snap.certbot.renew.timer` enabled·active; renew dry-run·deploy hook 종료 코드 0, 모의 갱신 전체 성공 확인 |
| 외부 API 검증 | 6개 통과: health/API, SPA 3개 경로·JS 번들, HTTP→HTTPS, 전화번호 없는 테스트 신고 201·재전송 200, 공개 신고 사진 API 404 |
| 모바일 Chrome | 390×844에서 secure context·홈 이미지·직접 입력→사진 단계·직접 주소 새로고침·런타임 오류 없음, 5개 통과 |
| 실제 저장·정리 | 테스트 신고의 DB 관계·JPEG 해시·EXIF 제거·파일 권한·실제 사진 경로의 비공개 접근 검증 통과; 생성한 테스트 신고·관계 데이터·사진 1개만 정리 완료 |
| 현재 릴리스 | `/srv/parkick/app` → `/srv/parkick/releases/20261017-photo-upload-1`; 2026-10-17 01:04:41 KST 배포; 사진 업로드 전 축소·압축과 실제 사이트 검증 완료 |
| Phase 5 배포 검증 | 실제 HTTPS 모바일 390px의 6단계 신고→201→완료 영수증→번호 목록 200·no-store→상세 처리 이력 통과; 가로 넘침·브라우저 번호 저장 없음, 상세 새로고침 시 재입력 확인 |
| Phase 5 운영 테스트 자료 | 테스트 2건의 표식·UUID·접수번호·내용·해시 일치를 확인하고 해당 DB 관계·사진만 정리 완료; 기존 사용자 데이터 유지 |
| 관리자 인증 검증 | 지정 플랫폼 관리자 등록 후 2026-10-15 23:31:34 KST(14:31:34 UTC)에 실제 로그인·새로고침·로그아웃과 기존 토큰 무효화 통과; production·개발 Mock 비활성화·기존 DB·사진·전화번호 키 유지 |
| 관리자 신고 관리 | DB 대시보드·목록·상세·사진·권한·처리중/수거/견인·메모 로컬·EC2 검증 완료 |
| Bedrock | 기존 Lambda 구성 및 로컬 Invoke DryRun 확인; 직접 호출용 최소 권한 JSON·관리자 안내 준비. 모델 호출 0회, 기존 인스턴스 프로필은 EC2 미연결·유효 권한 미검증, AI disabled 유지 |
| Client ID 최신 반영 | 2026-10-16 16:12:57 KST Frontend 재빌드·배포 완료; 새 ID로 지도·타일 9개 표시 확인, 주소 API는 여전히 HTTP 403 |
| 후속 작업 | 테넌트 계정 생성 UI·실제 관할 등록, 통계, 실제 휴대전화·백업 등 운영 검증 |

최초 SSH 문제는 웹 IP 조회 결과 `211.234.206.233`과 당시 실제 SSH 출발지 `211.234.206.163`의 차이로 발생해 출발지 확인 후 해결했습니다. 이후 `211.37.75.121/32` 제한으로 재접속을 확인했으며, 현재는 사용자의 최신 요청에 따라 TCP 22를 **`0.0.0.0/0`**에 계속 허용합니다. 자동 만료·복원은 없으며 사용자가 명시적으로 요청할 때만 변경합니다. Git SSH의 ED25519 호스트 키를 확인·고정해 사용합니다. Windows keyscan은 KEX 오류로 사용하지 않았습니다. Instance Connect Endpoint는 생성하지 않았으며 필요하지 않습니다. `SafePowerUser`의 역할 생성 거부는 향후 S3 전환 시 [IAM 관리자 절차](iam-admin-setup.md)로 해결할 사항입니다.

현재 배포 소스 아카이브의 SHA-256은 `e48f081af96fa1b579c7abefc7af59750ed795aa650504c9bb074a3ee26bca1f`입니다. 현재 릴리스와 검증 상태는 [deployment-status.json](deployment-status.json)에서도 확인할 수 있습니다.

리소스 식별자는 [deployment-status.json](deployment-status.json)에 기록합니다. SSH 개인 키는 버전 관리에서 제외된 로컬 `.tmp/aws/sgu-202686-key.pem`에 보관하며 소스 업로드나 문서 공유에 포함하지 않습니다. 초기 배포와 외부 API·브라우저·갱신 검사를 완료했으며 후속 운영 검증을 포함하는 Phase 8 전체 완료와는 구분합니다.

| 파일 | 용도 |
|---|---|
| `backend.env.example` | 운영 환경변수의 자리표시자 |
| `bootstrap-host.sh` | 새 Ubuntu 24.04 서버의 Node 22·Nginx·PostgreSQL·전용 계정·2GiB swap 준비 |
| `configure-demo.sh` | HTTPS Origin 한 인자로 전용 DB·서버 환경파일·비공개 사진 폴더 준비 |
| `parkick-api.service` | 비루트 계정으로 실행하는 systemd 서비스 |
| `nginx-http-bootstrap.conf` | 최초 인증서 발급을 위한 HTTP 임시 설정 |
| `nginx-parkick.conf` | HTTPS, SPA 라우팅, API 프록시 설정 |
| `iam-s3-reports-policy.json` | 향후 S3 전환용 `reports/*` 객체 접근 정책 |
| `iam-admin-setup.md` | 향후 S3 전환 시 관리자가 EC2 역할을 생성·연결하는 절차 |
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
- PostgreSQL 데이터와 신고 사진을 EC2의 지속 볼륨에 저장합니다. 서버를 교체할 때 DB·`/var/lib/parkick/reports`·전화번호 암호화 키를 함께 보존해야 합니다.
- 초기 `local` 사진 저장은 AWS 자격증명이나 IAM 역할을 사용하지 않습니다. 생성한 S3 버킷과 공개 차단·암호화 설정은 그대로 유지합니다.

S3 전환에 필요한 IAM·검증 절차는 마지막 선택 항목에 분리했습니다. 초기 배포를 위해 RDS·ECS·Secrets Manager·Parameter Store를 추가하지 않습니다.

2026-10-15 확인 당시 EC2 디스크 여유는 약 22GB, 신고 사진 사용량은 약 4.6MB였습니다. 현재 테스트는 웹·API·DB·사진을 모두 EC2에서 진행할 수 있습니다. 사진이 늘어나면 웹·API·DB는 유지하고 사진 저장만 S3로 옮기는 구성을 권장하며, 기존 사진의 별도 이관이 필요합니다.

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

EC2 → Bedrock 직접 호출은 [최소 권한 JSON](iam-bedrock-report-policy.json)과 [관리자 설정 안내](iam-admin-setup.md)에 정리했습니다. 기존 US Claude Haiku 4.5 프로필과 미국 3개 대상 리전의 모델만 범위에 포함했습니다. 실제 역할 변경·프로필 연결·AI 활성화는 수행하지 않았습니다. 이번 재조회 시 로컬 AWS CLI의 로그인 자격증명 갱신이 실패했고 `signin:CreateOAuth2Token` 부족 가능성을 안내했습니다. 이는 모델 호출 권한 거부를 확인한 결과가 아니며, 앞서 성공한 Lambda·추론 프로필 조회 결과와 구분합니다.

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

운영의 `local` 저장은 저장 모드를 명시하고 절대 사진 경로·HTTPS Origin·비밀번호 DB 연결을 설정해야 합니다. DB·사진·전화번호 키는 다음 배포에서도 유지합니다. 키를 새로 만들면 기존 연락처 복호화·검색이 불가능해질 수 있으므로 함께 복구할 수 있도록 접근을 제한해 백업합니다. Bedrock은 실제 모델 권한을 확인한 뒤 별도로 활성화하며 운영에서 Mock AI나 개발 관리자 인증을 켜지 않습니다.

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

현재 수정본은 실제 배포 주소의 모바일 Chrome 390px에서 6단계 신고·201 접수·완료 영수증·번호 목록 200/no-store·상세 처리 이력까지 통과했습니다. 가로 넘침이 없고 번호가 브라우저 저장소에 기록되지 않으며 상세 새로고침 시 번호를 다시 입력하는 것도 확인했습니다. 다른 번호와의 분리·입력 변경 즉시 이전 결과 제거·페이지 이동은 로컬 통합 검사에서 확인했습니다. 번호 없는 신고는 조회되지 않습니다. 기존 DB와 전화번호 키를 그대로 사용하므로 새 OTP·SMS·인증 서비스는 준비하지 않습니다.

`/`, `/report`를 직접 열고 새로고침했을 때 SPA가 동작하는지, 모바일 HTTPS에서 카메라·위치 권한을 사용할 수 있는지 확인합니다. 관리자 인증은 등록한 운영 계정의 로그인·새로고침 시 세션 복원·로그아웃 후 접근 거부를 확인합니다. 개발 `DEV_ADMIN_*` 계정은 운영 성공 조건으로 사용하지 않습니다. 현재 실제 EC2에서 DB 인증 모드와 쿠키 속성, 세션 복원·로그아웃 후 기존 토큰의 401 응답을 모두 확인했습니다.

재배포는 `/etc/parkick/backend.env`, PostgreSQL 데이터, `/var/lib/parkick/reports`를 유지하고 `/srv/parkick/releases/릴리스명`에서 설치·운영 빌드·`migrate deploy`를 준비한 뒤 `/srv/parkick/app` 연결 대상을 전환하고 API를 재시작하는 방식입니다. 현재 대상은 `20261016-reverse-geocoding-1`이며 이전 대상 `20261016-admin-map-2`를 보존했습니다. 이번 배포에서는 스키마 변경이 없어 Migration을 실행하지 않았습니다. 기존 릴리스와 S3 버킷은 보존합니다. DB 마이그레이션 전에는 DB·사진·전화번호 키를 복구할 수 있는 백업을 확보합니다. 소스 링크 복구와 DB 스키마 롤백은 별개이므로 이전 코드로 돌아갈 때 스키마 호환성도 확인합니다.

설정을 변경할 때는 실제 Ubuntu 호스트의 `nginx -t`·`systemd-analyze verify`로 확인합니다. 현재 외부 API 접수·재시도와 모바일 Chrome 초기 흐름·갱신 검사는 통과했습니다. 모바일 화면 설정의 브라우저 검사는 실제 휴대전화 카메라·GPS·전체 현장 신고 검증과 구분합니다.

## 9. 선택 사항: 나중에 사진을 S3로 전환

S3 어댑터와 비공개 버킷 `sgu-202686-s3`는 준비되어 있습니다. 개발 PC에서는 2026-10-15에 `npm.cmd run aws:check`로 테스트 JPEG 쓰기·읽기·내용 비교·삭제를 확인했습니다. EC2에서 S3로 전환할 때만 [IAM 관리자 절차](iam-admin-setup.md)에 따라 인스턴스 역할을 연결합니다. SDK는 역할의 임시 자격증명을 사용하며 개발 PC의 프로파일·로그인 캐시·장기 키를 서버에 복사하지 않습니다. [AWS EC2 IAM 역할 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)

S3 공개 차단·Bucket owner enforced·SSE-S3를 유지하고 `reports/*`의 `PutObject`, `GetObject`, `DeleteObject`만 허용합니다. 버저닝을 사용할 경우 연결 검사의 버전 지정 조회·삭제에 `GetObjectVersion`, `DeleteObjectVersion` 권한도 필요합니다. `HeadBucket`은 버킷 목록 권한을 요구하므로 이 최소 정책의 연결 확인에 사용하지 않습니다. [S3 권한 범위](https://docs.aws.amazon.com/us_en/AmazonS3/latest/userguide/access-policy-language-overview.html), [HeadBucket 권한](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html)

환경파일의 저장 모드와 AWS 리전·버킷을 명시적으로 변경한 후 서버에서 아래 선택적 연결 검사를 수행합니다. 이 검사는 S3 테스트 객체를 생성·조회·삭제하므로 초기 EC2 로컬 배포 검증에서는 실행하지 않습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-aws.ts
```

`REPORT_STORAGE_PROVIDER=s3`로 바꾸어도 기존 사진은 자동 이전되지 않습니다. 기존 로컬 사진과 DB 메타데이터의 별도 이관·검증을 먼저 계획하고, 서버에서 새 신고의 S3 저장·실패 시 정리를 확인합니다. 브라우저는 백엔드를 통해 업로드하므로 S3 CORS는 필요하지 않으며, 관리자 인증·테넌트 범위를 검사하는 비공개 사진 조회 API는 구현·로컬 검증과 EC2 배포·실제 HTTPS 검증을 완료했습니다.

## 10. 선택 사항: Bedrock 연결 검사

`BEDROCK_REGION`은 AI 전용 리전이며 비워 두면 `AWS_REGION`을 사용합니다. S3 서울 `ap-northeast-2`와 Bedrock 버지니아 `us-east-1`을 분리할 수 있습니다. 실제 자격증명·모델 호출 확인 전까지 운영 `AI_PROVIDER=disabled`를 유지합니다.

2026-10-16 로컬 `parkick` 프로파일의 `sgu-202686` 사용자 로그인을 복구했습니다. `SafeInstanceProfile-sgu-202686`이 존재함을 확인했지만 현재 EC2 인스턴스 프로필은 미연결이며 IMDS `iam/info`는 404입니다. API 서비스의 AWS 자격증명 환경변수와 `parkick` 서비스 계정의 `.aws` 파일도 없으므로 현재 EC2에서는 Bedrock 직접 호출과 Lambda 호출 모두 실행 자격증명이 없습니다. 기존 프로필의 EC2 신뢰 설정·필요 권한을 확인한 뒤 연결하고 서버 실행 환경에서 검증해야 합니다. 이번에는 프로필을 연결하지 않았으며 개발 PC의 키·로그인 캐시를 서버에 복사하지 않았습니다. 기존 [S3 역할 정책](iam-s3-reports-policy.json)은 Bedrock 호출을 허용하지 않습니다.

Lambda는 필수가 아니며 현재 EC2의 직접 Bedrock 호출 Provider를 사용할 수 있습니다. Lambda 경유 시 EC2에 `lambda:InvokeFunction`, Lambda 실행 역할에 `bedrock:InvokeModel` 권한이 필요합니다. [Lambda 호출 권한](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html)

기존 함수의 확인 결과는 다음과 같습니다.

| 항목 | 2026-10-16 확인 결과 |
| --- | --- |
| 함수 | 서울 `sgu-202686-bedrock`, Active, Python 3.14·x86_64·128MB·제한 시간 60초, VPC 연결 없음·Function URL 없음 |
| 실행 역할 | `SafeRole-sgu-202686`; `Shingu-AllowBedrockInvoke` 정책 연결 확인 |
| 호출 권한 검사 | 로컬 사용자로 `Invoke`의 `DryRun` 204 통과; 실제 함수 실행은 0회이며 EC2의 호출 권한을 뜻하지 않음 |
| 코드 | `prompt`·`session_id` 입력 → 서울 DynamoDB 대화 이력 조회·사용자 메시지 저장 → Bedrock Converse → 응답 메시지 저장 |
| Bedrock | 클라이언트 `us-east-1`, `us.anthropic.claude-haiku-4-5-20251001-v1:0` 추론 프로필 ACTIVE |
| 추론 대상 리전 | `us-east-1`·`us-east-2`·`us-west-2`; 버지니아에 한정되지 않음 |
| 미확인 권한 | `GetPolicyVersion`·`GetRole`·`GetRolePolicy`·`SimulatePrincipalPolicy` 제한으로 정책 본문·신뢰 정책·유효 권한 미확인; 실제 Bedrock 모델 호출 0회 |

현재 신고문 생성 Provider를 활용하는 **EC2 직접 호출을 권장**합니다. 기존 Lambda는 대화 이력 저장이 포함된 챗봇 함수이므로 재사용하려면 해당 동작을 제거하거나 신고문 전용 함수를 별도로 구성해야 합니다. 이번에는 함수·역할·정책을 변경하지 않았고 운영 AI는 비활성화 상태를 유지합니다. 로컬 DryRun 성공과 추론 프로필 ACTIVE만으로 모델 실행 성공을 판정하지 않습니다.

직접 호출 검사를 준비할 때 프로젝트 루트의 `backend/.env`에 `AWS_PROFILE=parkick`, `BEDROCK_REGION=us-east-1`, `BEDROCK_REPORT_MODEL_ID=amazon.nova-micro-v1:0`을 설정하고 다음 검사를 실행합니다. `AI_PROVIDER=disabled`인 상태에서도 검사할 수 있습니다. 이 예시 Amazon 모델은 기존 Lambda의 Claude 모델과 다르므로 결과를 서로의 권한 검증으로 해석하지 않습니다.

```bash
node --import tsx backend/scripts/check-bedrock.ts
```

CLI는 실제 신고·개인정보 대신 고정된 합성 문구를 Amazon 기본 모델에 한 번 전송합니다. 최대 출력 16토큰·15초 제한·재시도 없음이며 소량의 모델 사용료가 발생할 수 있습니다. 성공 시 상태·토큰 사용량만 출력하고 자격증명·생성문은 출력하지 않습니다. 타사 모델·교차 리전 추론 프로파일은 검사하지 않습니다. [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)에 필요한 권한은 `bedrock:InvokeModel`입니다. 향후 EC2 역할과 모델 권한이 준비되면 같은 서버 실행 환경에서 검증한 후 AI를 활성화합니다.

2026-10-16 18:17:54 KST 안내 문구까지 업체 선택으로 통일한 최종 릴리스 `20261016-operator-selection-2`를 배포했습니다. SHA-256 `675b4af4a03cf97fcac46efb0182ab7cdd7dbba87b2af7ff335db917613bbe5a`. 18:18:25 KST 실제 모바일 화면에서 최종 안내·카카오 실물 QR 자동 선택·수동 변경 확인을 통과했습니다. 기존 업체명 정리와 백업은 유지하며 추가 데이터 수정은 없었습니다.

2026-10-16 **22:48:29 KST(13:48:29Z)** 관련 신고·QR 보완 릴리스 `20261016-related-qr-1`을 배포했습니다. 소스 SHA-256은 `6ca8ecb0194d82fd52ceb21b1b686c0826977a93eead87e8b2bbed2e0c5b2941`입니다. 같은 테넌트·지역·업체·기기번호의 미완료 신고를 현재 신고 기준 100m·전후 24시간 안에서 후보로 제시하고, 중간 완료 기록으로 새 사건을 구분합니다. 관리자가 직접 선택한 신고만 수거/견인 완료하며 각 접수번호와 개별 이력을 보존합니다. 빔 영문·숫자 QR, 빔 선택 후 5자리 숫자 입력, 지쿠 `08201`+6자리 번호와 사진 축소·명암 보정을 지원합니다. 수동 수정은 진행 중인 사진·카메라 판독과 해석 응답을 취소합니다.

Backend 단위/API **127개**, 전용 PostgreSQL/API **14개**, 전체 브라우저 **39개**, 실제 DB 관리자 브라우저 **4개**를 통과했습니다. Frontend/Backend lint·타입 검사와 Frontend 빌드를 통과했습니다. 로컬 Backend 전체 빌드의 Prisma DLL 교체는 Windows 파일 잠금(EPERM)으로 실패했으나, EC2 새 폴더에서 `npm ci`·Prisma 생성·전체 운영 빌드·API·접수 준비 검사는 통과했습니다. **22:48:54 KST** 실제 사이트에서 사용자 빔 2장·지쿠·카카오 원본 사진, 기존 신고 6건의 관련 조회와 브라우저 합성 후보의 명시적 선택·확인창 취소를 확인했습니다. 실제 일괄 저장·충돌·재시도는 전용 로컬 DB에서 검증했습니다. 운영 신고 생성/완료·사진 업로드·QR 목적지 방문·브라우저 오류는 0회입니다. 이전 릴리스·DB·사진·공개 지도 설정을 보존했고 스키마 변경이나 업체명 추가 정리는 하지 않았습니다.
