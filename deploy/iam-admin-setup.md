# Parkick EC2의 S3 역할 연결과 AI 연동

2026-10-23 `parkick` AWS CLI 로그인(IAM 사용자 `sgu-202686`) 후 기존 `SafeInstanceProfile-sgu-202686`을 EC2 `i-0a95ee1a77e3722a4`에 연결했습니다. association `iip-assoc-0a7d3a8136ba4ba4b`는 `associated`이며 EC2의 `parkick` 서비스 계정에서 S3 임시 객체 쓰기·읽기·삭제가 통과했습니다. 운영은 `REPORT_STORAGE_PROVIDER=s3`이고 기존 사진 6장의 S3 이전·검증이 끝났습니다. EC2에는 개발 PC의 로그인 캐시나 장기 Access Key를 복사하지 않았습니다. 사진 판별용 내부 LiteLLM 프록시의 접속 정보와 API 키를 전달받았으며, 키 값은 이 문서에 기록하지 않습니다.

내부 API는 `https://52.78.77.90`의 LiteLLM 1.102.0 HTTPS 프록시입니다. 유효한 TLS와 인증된 모델 목록, 합성 JPEG 요청의 HTTP 200 및 무관 사진 판정을 확인했습니다. Parkick 운영 EC2는 `AI_PROVIDER=litellm`이며 외부 HTTPS 사전 검사에서 공유 킥보드 사진은 허용, 무관 JPEG는 거부했습니다. 최종 신고 제출은 아직 시험하지 않았습니다. `/api/health`의 `services.ai=disabled`는 이전 텍스트 신고문 생성기 상태이고 사진 판별은 `services.photoValidation=litellm`입니다. 키는 소스나 프런트엔드에 넣지 않고 EC2 서버의 접근 제한된 환경파일로만 관리합니다. 아래 Bedrock 직접 호출 정책과 절차는 별도 대안 자료이며 현재 적용하지 않습니다. S3 저장과 AI 판별은 별개입니다.

## 내부 LiteLLM 프록시 운영 연결

프록시의 `GET /v1/models`에서 `bedrock-haiku`, `bedrock-sonnet`, `bedrock-gpt-5.6-luna`를 확인했습니다. `bedrock-haiku`에 합성 사과 JPEG를 넣은 `POST /v1/chat/completions` 응답은 JSON 판정을 Markdown 코드 블록으로 감싸 반환했습니다. 이 결과만으로 Parkick의 응답 해석, 관련 사진 허용 품질 또는 운영 신고 성공을 보장할 수 없습니다.

운영 `/etc/parkick/backend.env`에는 `AI_PROVIDER=litellm`, `LLM_API_BASE_URL=https://52.78.77.90`, `LLM_REPORT_MODEL_ID=bedrock-haiku`, 비공개 `LLM_API_KEY`를 설정했습니다. 백엔드는 `x-litellm-api-key` 헤더로 인증하며 실제 프록시 시험도 이 헤더를 사용했습니다. 키는 EC2 환경파일에 `root:parkick`, 권한 `0640`으로 보관합니다. `/srv/parkick/app`은 `/srv/parkick/releases/20261023-litellm-photo-1`을 가리키고 서비스가 활성화됐습니다. 공유 킥보드 사진 200·무관 JPEG 422의 운영 사전 검사를 통과했으며 신고 생성은 0건입니다. 키는 코드·문서·프런트엔드·로그에 남기지 않습니다. 최종 접수와 브라우저 사진 조회는 별도 검증이 필요합니다.

이 경로는 EC2 백엔드가 프록시에 HTTPS 요청을 보내며, Parkick EC2 역할의 직접 `bedrock:InvokeModel` 권한을 요구하지 않습니다. 현재 연결된 EC2 역할은 S3 사진 저장에 계속 필요하고 그 권한은 변경하지 않습니다. 프록시 운영자의 모델 접근 권한과 과금은 프록시 측 관리 범위입니다.

## 기존 대안: Bedrock 직접 호출 권한

**현재의 LiteLLM 프록시 경로에는 EC2 백엔드의 직접 Bedrock 호출 권한이 필요하지 않습니다.** 아래 정책 파일과 절차는 직접 호출 대안 자료입니다. 현재 운영 EC2의 프로필은 S3 저장용으로 연결됐지만 직접 Bedrock 호출 권한과 실제 이미지 호출은 검증하지 않았습니다.

## 1. Bedrock 직접 호출에 필요한 설정

| 항목 | 값 |
|---|---|
| AWS 계정 | `443370697536` |
| EC2 | 서울 `sgu-202686-ec2` / `i-0a95ee1a77e3722a4` |
| 기존 인스턴스 프로필 | `SafeInstanceProfile-sgu-202686` — 2026-10-23 EC2에 연결, S3 작업 검증 완료 |
| 기존 역할 | `SafeRole-sgu-202686` — 기존 Lambda도 사용하는 역할 |
| Bedrock API 호출 리전 | `us-east-1` (버지니아) |
| 모델 ID | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| 추론 대상 리전 | `us-east-1`, `us-east-2`, `us-west-2` |
| 준비한 권한 정책 | [iam-bedrock-report-policy.json](iam-bedrock-report-policy.json) |

정책은 기존 실습 Lambda에서 확인한 **Claude Haiku 4.5의 US 추론 프로필**을 Parkick의 사진 판별에도 사용할 경우를 기준으로 합니다. 새 소스는 `BedrockRuntimeClient`의 비스트리밍 `ConverseCommand`에 정제·축소한 현장 JPEG를 넣어 관련성을 판별합니다. [Claude Haiku 4.5는 이미지 입력과 Converse를 지원합니다](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html). 준비한 EC2 실행 역할 정책에는 다음 권한을 포함했습니다.

| 권한 | 허용 범위·용도 |
|---|---|
| `bedrock:InvokeModel` | 위 추론 프로필과 미국 3개 리전의 해당 Haiku 4.5 모델만 허용 |
| `bedrock:GetInferenceProfile` | 위 추론 프로필 하나만 조회 — 연결 점검용이며 `Converse` 호출 자체에는 불필요 |

`Converse`의 IAM 권한 이름은 `bedrock:InvokeModel`입니다. 현재 사진 판별에는 스트리밍·모델 목록 조회·프로필 생성 권한이 필요하지 않습니다. [Converse 권한](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [추론 프로필 사용 권한](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html)

준비한 JSON은 프로필 ARN과 모델 ARN을 분리하고, 모델 리소스에는 `bedrock:InferenceProfileArn` 조건을 적용했습니다. **이 모델은 버지니아에서만 처리되는 구성이 아닙니다.** 조직 정책(SCP)이나 권한 경계가 대상 리전을 차단하면 역할에 Allow를 추가해도 호출이 실패할 수 있습니다. 관리자는 해당 프로필에 필요한 리전 허용 여부를 확인해야 합니다. [공식 교차 리전 IAM·SCP 안내](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)

EC2 서비스가 역할을 사용할 수 있도록 신뢰 정책에 `Principal.Service = ec2.amazonaws.com`, `Action = sts:AssumeRole`도 필요합니다. **기존 `SafeRole-sgu-202686`을 재사용한다면 Lambda의 신뢰 관계를 보존하면서 확인·추가해야 합니다.** [iam-ec2-trust.json](iam-ec2-trust.json)은 신규 EC2 전용 역할용이므로 공유 역할의 신뢰 정책 전체를 이 파일로 덮어쓰지 않습니다. SDK는 EC2 역할의 임시 자격증명을 사용하며, 애플리케이션에 별도의 `sts:AssumeRole` 허용 정책이나 AWS 액세스 키를 넣을 필요는 없습니다. [EC2 애플리케이션의 IAM 역할 사용](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)

2026-10-16에 `SafeRole-sgu-202686`에 `Shingu-AllowBedrockInvoke` 정책이 연결된 사실만 확인했습니다. 정책 본문·유효 Bedrock 권한 조회가 거부되어 필요한 모델 권한을 이미 갖췄는지는 미확정입니다. 2026-10-23에 프로필을 EC2에 연결해 S3 접근을 확인했지만 Bedrock 모델은 호출하지 않았습니다. 향후 Bedrock 직접 호출이 허용되면 관리자는 기존 정책이 충분한지 먼저 확인하고, 부족할 때 위 JSON의 권한만 추가합니다. 추가 Allow 정책은 기존의 더 넓은 권한을 축소하지 않습니다.

## 2. 향후 Bedrock 직접 호출을 선택할 경우의 관리자 작업

다음 권한은 **설정하는 관리자에게 필요한 권한**이며 EC2 애플리케이션 실행 역할에 부여하는 권한과 구분합니다.

| 작업 | 관리자 권한 |
|---|---|
| 기존 역할·프로필·정책 확인 | `iam:GetRole`, `iam:GetInstanceProfile`, `iam:ListRolePolicies`, `iam:GetRolePolicy`, `iam:ListAttachedRolePolicies`, `iam:GetPolicy`, `iam:GetPolicyVersion` |
| 필요한 경우 인라인 모델 정책 추가 | `iam:PutRolePolicy` — 사용할 역할로 제한 |
| 필요한 경우 EC2 신뢰 관계 추가 | `iam:UpdateAssumeRolePolicy` — 사용할 역할로 제한, 기존 Lambda 신뢰 보존 |
| 기존 프로필을 EC2에 연결 | 2026-10-23 완료: `iam:PassRole` + `ec2:AssociateIamInstanceProfile` |
| 연결 상태 확인 | `ec2:DescribeInstances`, `ec2:DescribeIamInstanceProfileAssociations` |
| 콘솔의 역할 목록 선택 | 콘솔을 사용할 경우 `iam:ListInstanceProfiles` |

기존 프로필은 이미 서울의 `i-0a95ee1a77e3722a4`에 연결됐으며 다시 연결할 필요가 없습니다. 향후 다른 인스턴스에 연결할 경우 `iam:PassRole`은 `arn:aws:iam::443370697536:role/SafeRole-sgu-202686`으로 제한하고 `iam:PassedToService = ec2.amazonaws.com` 조건을 사용합니다. [EC2 역할 연결 권한](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/permission-to-pass-iam-roles.html)

기존 역할과 프로필을 재사용하면 `iam:CreateRole`, `iam:CreateInstanceProfile` 권한은 필요하지 않습니다. 현재 사용자에게 적용된 명시적 Deny를 우회하지 않고 해당 작업 권한을 가진 관리자가 설정합니다.

향후 직접 Bedrock 호출을 선택하고 기존 정책이 부족할 때 관리자에게 적용을 요청할 정책 예시입니다. 현재의 S3 운영에는 필요하지 않습니다. `AWS_ADMIN_PROFILE`은 관리자의 로컬 AWS 프로필 이름으로 바꿉니다.

```bash
aws iam put-role-policy --role-name SafeRole-sgu-202686 --policy-name ParkickBedrockReport --policy-document file://deploy/iam-bedrock-report-policy.json --profile AWS_ADMIN_PROFILE
aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=i-0a95ee1a77e3722a4 --region ap-northeast-2 --profile AWS_ADMIN_PROFILE
```

계정의 모델 최초 활성화가 아직 안 됐다면 관리자가 Anthropic 사용 목적 등록과 모델 접근 활성화를 처리합니다. 이때 관리자에게 `bedrock:PutUseCaseForModelAccess`, 해당 절차에 필요한 AWS Marketplace 권한(`aws-marketplace:Subscribe`, `aws-marketplace:ViewSubscriptions`, 구독 해제 관리용 `aws-marketplace:Unsubscribe`) 등이 필요할 수 있습니다. **계정에서 모델 활성화가 완료된 뒤에는 EC2 실행 역할에 Marketplace 구독 권한이 필요하지 않습니다.** 기존 Lambda 설정이나 DryRun 성공만으로 모델 활성화 완료를 판단하지 않습니다. [모델 최초 활성화 안내](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

Bedrock 직접 호출 대안 자체에는 `lambda:InvokeFunction`, DynamoDB, S3, Secrets Manager, SSM, `AmazonBedrockFullAccess`가 필요하지 않습니다. 신고 JPEG는 현재 별도로 S3에 저장합니다. 판별 기능을 활성화하면 정제·축소한 현장 사진을 `us-east-1`의 US 추론 프로필에 전송합니다. 미국 내 세 대상 리전 중 한 곳에서 처리될 수 있습니다. 전화번호·QR 원문·위치 좌표는 모델 요청에 넣지 않습니다.

## 3. Bedrock 직접 호출 허용 시 Parkick 설정

검증 후 사용할 운영 환경변수는 EC2의 `/etc/parkick/backend.env`에 아래와 같습니다. EC2와 S3의 기존 `AWS_REGION=ap-northeast-2`는 유지할 수 있습니다.

```dotenv
AI_PROVIDER=bedrock
BEDROCK_REGION=us-east-1
BEDROCK_REPORT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

Bedrock 직접 호출 권한이 준비되지 않아도 현재의 `AI_PROVIDER=litellm`으로 사진 판별을 사용할 수 있습니다. 운영 `mock`은 허용하지 않습니다. 향후 직접 Bedrock 대안을 선택할 때에만 역할·Anthropic 모델 접근·실제 이미지 호출을 확인한 뒤 위 설정으로 변경합니다. EC2 실행 사용자에게 역할 자격증명이 제공되는지, 선택한 모델의 시험 사진 판별이 성공하는지 확인합니다. 실제 모델 호출에는 토큰 요금이 발생합니다.

역할 연결 후에는 EC2에서 `sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-photo-validation.ts`를 실행합니다. 로컬에서는 `npm run aws:check:photo --workspace backend`를 사용할 수 있습니다. 이 검사는 합성 사과 JPEG를 모델에 보내 `PHOTO_NOT_PM`으로 거부되는지 확인합니다. 실제 신고 사진은 사용하지 않지만 소량의 모델 요금이 발생할 수 있습니다. 이어서 개인정보 없는 킥보드·자전거 시험 사진의 허용 여부와 최종 접수도 검증해야 합니다.

기존 `backend/scripts/check-bedrock.ts`는 `amazon.*` 기본 모델에 합성 텍스트만 보내므로 **위 Claude 추론 프로필과 이미지 입력을 검증하지 못합니다.** 이전 검사 예시의 [Nova Micro는 텍스트 전용](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-micro.html)입니다.

## 4. 완료된 사진 S3 전환과 재검증

기존 `SafeInstanceProfile-sgu-202686`과 그 역할 `SafeRole-sgu-202686`을 재사용했습니다. 새 역할·프로필 생성이나 IAM 정책 변경은 필요하지 않았습니다. EC2 association `iip-assoc-0a7d3a8136ba4ba4b`는 `associated`이고, 서비스 계정의 실제 S3 `PutObject`·`GetObject`·`DeleteObject` 검사를 통과했습니다. 운영 환경파일의 `REPORT_STORAGE_PROVIDER=s3`, `AWS_REGION=ap-northeast-2`, `S3_REPORT_BUCKET=sgu-202686-s3`, `S3_REPORT_PREFIX=reports`를 활성화했습니다. 기존 사진 6장(12,195,775바이트)을 S3로 이전·조회 검증하고 로컬 원본 및 manifest를 복구용으로 남겼습니다. 백업은 `/var/backups/parkick/s3-cutover-20261023-1`에 보관합니다. [배포 안내의 S3 전환 기록](README.md#9-사진을-s3로-전환)을 참조하세요.

2026-10-15에 새 역할 생성은 `SafePowerUser` 정책의 명시적 Deny로 거부됐지만 기존 프로필 재사용으로 전환을 완료했습니다. 향후 권한이나 배포 구성을 변경할 때도 개발 PC의 장기 키를 EC2에 넣지 않습니다. 브라우저를 통한 실제 이전 사진 조회와 신규 신고 제출은 별도 검증이 필요합니다.

권한을 재확인하려면 EC2에서 다음 일회성 객체 검사를 실행합니다. 버킷 목록 조회 권한은 요구하지 않습니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-aws.ts
```

S3 정책과 Bedrock 정책은 별개입니다. 현재 역할의 S3 성공은 모델 호출 권한을 증명하지 않습니다. S3 공개 접근 차단을 유지하고, 장기 AWS 키나 개발 PC의 로그인 캐시는 EC2로 복사하지 않습니다.

SSH TCP 22는 사용자의 요청에 따라 `0.0.0.0/0` 허용을 유지하며 이 IAM 작업으로 변경하지 않습니다. 기존 관리자 인증·신고 조회·수거/견인 처리·관리자 지도는 위 AWS 역할 없이 동작합니다.
