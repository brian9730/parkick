# Parkick EC2의 Bedrock 직접 호출 권한과 선택 S3 권한

**현재 요청은 EC2 백엔드가 Bedrock을 직접 호출하도록 필요한 권한을 준비하는 것입니다.** 아래 정책 파일과 절차는 관리자에게 전달할 자료이며, 이 문서를 작성하면서 AWS 역할·정책·인스턴스 연결이나 운영 AI 설정을 변경하지 않았습니다. 기준일은 2026-10-16입니다.

## 1. Bedrock 직접 호출에 필요한 설정

| 항목 | 값 |
|---|---|
| AWS 계정 | `443370697536` |
| EC2 | 서울 `sgu-202686-ec2` / `i-0a95ee1a77e3722a4` |
| 기존 인스턴스 프로필 | `SafeInstanceProfile-sgu-202686` — 존재하지만 마지막 확인 시 EC2에 미연결 |
| 기존 역할 | `SafeRole-sgu-202686` — 기존 Lambda도 사용하는 역할 |
| Bedrock API 호출 리전 | `us-east-1` (버지니아) |
| 모델 ID | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| 추론 대상 리전 | `us-east-1`, `us-east-2`, `us-west-2` |
| 준비한 권한 정책 | [iam-bedrock-report-policy.json](iam-bedrock-report-policy.json) |

정책은 기존 실습 Lambda에서 확인한 **Claude Haiku 4.5의 US 추론 프로필**을 Parkick에서도 사용할 경우를 기준으로 합니다. 현재 Parkick은 `BedrockRuntimeClient`의 비스트리밍 `ConverseCommand`로 신고문을 생성합니다. EC2 실행 역할에 필요한 모델 권한은 다음 두 가지입니다.

| 권한 | 허용 범위·용도 |
|---|---|
| `bedrock:InvokeModel` | 위 추론 프로필과 미국 3개 리전의 해당 Haiku 4.5 모델만 허용 |
| `bedrock:GetInferenceProfile` | 위 추론 프로필 하나만 조회 — 추론 프로필 사용 요건 |

`Converse`의 IAM 권한 이름은 `bedrock:InvokeModel`입니다. 현재 구현에는 스트리밍·모델 목록 조회·프로필 생성 권한이 필요하지 않습니다. [Converse 권한](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [추론 프로필 사용 권한](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html)

준비한 JSON은 프로필 ARN과 모델 ARN을 분리하고, 모델 리소스에는 `bedrock:InferenceProfileArn` 조건을 적용했습니다. **이 모델은 버지니아에서만 처리되는 구성이 아닙니다.** 조직 정책(SCP)이나 권한 경계가 대상 리전을 차단하면 역할에 Allow를 추가해도 호출이 실패할 수 있습니다. 관리자는 해당 프로필에 필요한 리전 허용 여부를 확인해야 합니다. [공식 교차 리전 IAM·SCP 안내](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)

EC2 서비스가 역할을 사용할 수 있도록 신뢰 정책에 `Principal.Service = ec2.amazonaws.com`, `Action = sts:AssumeRole`도 필요합니다. **기존 `SafeRole-sgu-202686`을 재사용한다면 Lambda의 신뢰 관계를 보존하면서 확인·추가해야 합니다.** [iam-ec2-trust.json](iam-ec2-trust.json)은 신규 EC2 전용 역할용이므로 공유 역할의 신뢰 정책 전체를 이 파일로 덮어쓰지 않습니다. SDK는 EC2 역할의 임시 자격증명을 사용하며, 애플리케이션에 별도의 `sts:AssumeRole` 허용 정책이나 AWS 액세스 키를 넣을 필요는 없습니다. [EC2 애플리케이션의 IAM 역할 사용](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)

현재 `SafeRole-sgu-202686`에는 `Shingu-AllowBedrockInvoke`라는 정책이 연결된 사실만 확인했습니다. 정책 본문·신뢰 정책·유효 권한 조회가 거부되어 필요한 권한을 이미 갖췄는지는 미확정입니다. 관리자는 기존 정책이 충분한지 먼저 확인하고, 부족할 때 위 JSON의 권한만 추가합니다. 추가 Allow 정책은 기존의 더 넓은 권한을 축소하지 않습니다.

## 2. 관리자가 적용할 작업

다음 권한은 **설정하는 관리자에게 필요한 권한**이며 EC2 애플리케이션 실행 역할에 부여하는 권한과 구분합니다.

| 작업 | 관리자 권한 |
|---|---|
| 기존 역할·프로필·정책 확인 | `iam:GetRole`, `iam:GetInstanceProfile`, `iam:ListRolePolicies`, `iam:GetRolePolicy`, `iam:ListAttachedRolePolicies`, `iam:GetPolicy`, `iam:GetPolicyVersion` |
| 필요한 경우 인라인 모델 정책 추가 | `iam:PutRolePolicy` — 사용할 역할로 제한 |
| 필요한 경우 EC2 신뢰 관계 추가 | `iam:UpdateAssumeRolePolicy` — 사용할 역할로 제한, 기존 Lambda 신뢰 보존 |
| 기존 프로필을 EC2에 연결 | `iam:PassRole` + `ec2:AssociateIamInstanceProfile` |
| 연결 상태 확인 | `ec2:DescribeInstances`, `ec2:DescribeIamInstanceProfileAssociations` |
| 콘솔의 역할 목록 선택 | 콘솔을 사용할 경우 `iam:ListInstanceProfiles` |

`iam:PassRole`은 `arn:aws:iam::443370697536:role/SafeRole-sgu-202686`으로 제한하고 `iam:PassedToService = ec2.amazonaws.com` 조건을 사용합니다. 연결 작업은 서울의 `i-0a95ee1a77e3722a4`만 대상으로 합니다. 현재 미연결 상태에서는 프로필 교체·분리 권한이 필요하지 않습니다. [EC2 역할 연결 권한](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/permission-to-pass-iam-roles.html)

기존 역할과 프로필을 재사용하면 `iam:CreateRole`, `iam:CreateInstanceProfile` 권한은 필요하지 않습니다. 현재 사용자에게 적용된 명시적 Deny를 우회하지 않고 해당 작업 권한을 가진 관리자가 설정합니다.

관리자가 기존 정책·신뢰 관계를 확인한 후 실행할 예시입니다. `AWS_ADMIN_PROFILE`은 관리자의 로컬 AWS 프로필 이름으로 바꿉니다. 필요한 모델 권한이 이미 있으면 첫 명령은 생략합니다.

```bash
aws iam put-role-policy --role-name SafeRole-sgu-202686 --policy-name ParkickBedrockReport --policy-document file://deploy/iam-bedrock-report-policy.json --profile AWS_ADMIN_PROFILE
aws ec2 associate-iam-instance-profile --instance-id i-0a95ee1a77e3722a4 --iam-instance-profile Name=SafeInstanceProfile-sgu-202686 --region ap-northeast-2 --profile AWS_ADMIN_PROFILE
aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=i-0a95ee1a77e3722a4 --region ap-northeast-2 --profile AWS_ADMIN_PROFILE
```

계정의 모델 최초 활성화가 아직 안 됐다면 관리자가 Anthropic 사용 목적 등록과 모델 접근 활성화를 처리합니다. 이때 관리자에게 `bedrock:PutUseCaseForModelAccess`, 해당 절차에 필요한 AWS Marketplace 권한(`aws-marketplace:Subscribe`, `aws-marketplace:ViewSubscriptions`, 구독 해제 관리용 `aws-marketplace:Unsubscribe`) 등이 필요할 수 있습니다. **계정에서 모델 활성화가 완료된 뒤에는 EC2 실행 역할에 Marketplace 구독 권한이 필요하지 않습니다.** 기존 Lambda 설정이나 DryRun 성공만으로 모델 활성화 완료를 판단하지 않습니다. [모델 최초 활성화 안내](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

현재 텍스트 신고문 생성에는 `lambda:InvokeFunction`, DynamoDB, S3, Secrets Manager, SSM, `AmazonBedrockFullAccess`가 필요하지 않습니다. 사진의 S3 전환은 아래 별도 정책을 사용할 때만 추가합니다.

## 3. 권한 연결 후 Parkick 설정

검증 후 사용할 운영 환경변수는 EC2의 `/etc/parkick/backend.env`에 아래와 같습니다. EC2와 S3의 기존 `AWS_REGION=ap-northeast-2`는 유지할 수 있습니다.

```dotenv
AI_PROVIDER=bedrock
BEDROCK_REGION=us-east-1
BEDROCK_REPORT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

이번 작업에서는 운영 `AI_PROVIDER=disabled`를 유지합니다. EC2 실행 사용자에게 역할 자격증명이 제공되는지와 선택한 모델의 합성 신고문 생성이 성공하는지를 먼저 확인한 뒤 위 설정으로 전환하고 API 서비스를 재시작합니다. 실제 모델 호출에는 토큰 요금이 발생합니다.

기존 `backend/scripts/check-bedrock.ts`는 `amazon.*` 기본 모델만 허용하는 검사이므로 **위 Claude 추론 프로필을 검증하지 못합니다.** 이 스크립트의 Amazon 모델 성공을 Haiku 권한 확인으로 대체하면 안 됩니다. 실제 Haiku 연결 시 검사 대상을 명시한 검증을 추가해야 합니다. 현재 애플리케이션의 Bedrock Provider 자체는 추론 프로필 ID를 지원합니다.

## 4. 선택 사항: 향후 사진 S3 전환

웹·API·PostgreSQL·사진을 모두 EC2에 두는 기존 기능에는 S3 권한이 필요하지 않습니다. 현재 사진은 `/var/lib/parkick/reports` 비공개 폴더에 저장하며, 아래 S3 정책은 나중에 사진을 S3로 전환할 때만 적용합니다. 생성된 `sgu-202686-s3` 버킷과 기존 파일은 유지하고 저장 모드 변경만으로 사진을 자동 이전하지 않습니다.

2026-10-15 현재 `sgu-202686` 사용자의 `iam:CreateRole` 요청은 `SafePowerUser` 정책의 명시적 Deny로 거부됩니다. 이 문서는 **역할을 만들고 EC2에 연결할 권한이 있는 AWS 관리자**가 적용할 요청입니다. 기존 사용자 정책을 완화하거나 관리자 키를 애플리케이션에 전달할 필요는 없습니다.

2026-10-16 재확인 시 기존 `SafeInstanceProfile-sgu-202686`과 `SafeRole-sgu-202686`이 존재하지만 현재 EC2에는 프로필이 연결되어 있지 않았습니다. 기존 역할의 신뢰 정책·정책 본문·유효 권한은 조회 권한 제한으로 확인하지 못했습니다. 아래 새 역할 생성 절차를 적용하기 전에 관리자는 기존 프로필을 EC2에 사용할 수 있는지와 필요한 S3 권한을 먼저 확인합니다. 이번 확인에서는 기존 프로필 연결이나 정책 변경을 수행하지 않았습니다.

| 항목 | 값 |
|---|---|
| 리전 | `ap-northeast-2` (서울) |
| EC2 | `sgu-202686-ec2` / `i-0a95ee1a77e3722a4` |
| 역할 | `sgu-202686-ec2-role` |
| 인스턴스 프로필 | `sgu-202686-ec2-profile` |
| 신뢰 대상 | EC2 서비스 `ec2.amazonaws.com` |
| S3 범위 | `arn:aws:s3:::sgu-202686-s3/reports/*` |
| S3 작업 | `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` |

기존 프로필을 재사용할 수 없고 관리자가 EC2 전용 역할을 만들기로 한 경우에만 아래 생성 예시를 사용합니다. 기존 프로필을 재사용한다면 위 역할에 [S3 정책](iam-s3-reports-policy.json)만 별도로 추가합니다. `AWS_ADMIN_PROFILE`은 관리자의 실제 로컬 프로필 이름으로 바꿉니다. 명령을 다시 실행할 때는 먼저 같은 이름의 리소스 존재 여부와 설정을 확인하고 이미 완료된 생성 단계는 건너뜁니다.

```bash
aws iam create-role --role-name sgu-202686-ec2-role --assume-role-policy-document file://deploy/iam-ec2-trust.json --tags Key=Project,Value=Parkick --profile AWS_ADMIN_PROFILE
aws iam put-role-policy --role-name sgu-202686-ec2-role --policy-name sgu-202686-s3-reports --policy-document file://deploy/iam-s3-reports-policy.json --profile AWS_ADMIN_PROFILE
aws iam create-instance-profile --instance-profile-name sgu-202686-ec2-profile --tags Key=Project,Value=Parkick --profile AWS_ADMIN_PROFILE
aws iam add-role-to-instance-profile --instance-profile-name sgu-202686-ec2-profile --role-name sgu-202686-ec2-role --profile AWS_ADMIN_PROFILE
aws ec2 associate-iam-instance-profile --instance-id i-0a95ee1a77e3722a4 --iam-instance-profile Name=sgu-202686-ec2-profile --region ap-northeast-2 --profile AWS_ADMIN_PROFILE
```

역할·프로필 생성 직후에는 AWS 전파 지연이 있을 수 있습니다. 역할 연결 단계에서 새 프로필이 아직 조회되지 않으면 잠시 후 동일한 연결 요청만 재시도합니다. EC2의 역할 탭에서 연결 상태를 확인한 뒤 [배포 안내의 S3 전환 절차](README.md#9-선택-사항-나중에-사진을-s3로-전환)에 따라 저장 모드·리전·버킷을 설정합니다. 다음 명령으로 테스트 사진의 실제 업로드·읽기·삭제를 확인합니다. 기존 사진 이관과 새 신고 검증은 별도로 수행합니다.

```bash
cd /srv/parkick/app
sudo -u parkick node --env-file=/etc/parkick/backend.env --import tsx backend/scripts/check-aws.ts
```

S3 정책과 Bedrock 정책은 별개입니다. 새 EC2 전용 역할에서도 Bedrock을 호출하려면 [Bedrock 정책](iam-bedrock-report-policy.json)을 그 역할에 추가합니다. S3 공개 접근 차단은 유지하고, 장기 AWS 키나 개발 PC의 로그인 캐시는 EC2로 복사하지 않습니다.

SSH TCP 22는 사용자의 요청에 따라 `0.0.0.0/0` 허용을 유지하며 이 IAM 작업으로 변경하지 않습니다. 기존 관리자 인증·신고 조회·수거/견인 처리·관리자 지도는 위 AWS 역할 없이 동작합니다.
