# 가온고 평가계획서 자동 검토 시스템

평가계획서의 PDF·이미지·텍스트를 OpenRouter를 통해 Gemini 3.5 Flash로 검토하는 웹 앱입니다.

## 보안 구조

- 브라우저는 `/api/analyze`만 호출합니다.
- OpenRouter API 키는 Vercel 환경변수에만 저장되며 HTML이나 GitHub 저장소에 포함되지 않습니다.
- 공개된 API가 무단 사용되지 않도록 교직원 접속 코드를 서버에서 확인합니다.
- 접속 코드는 브라우저의 로컬 저장소에 보관됩니다. 공용 PC에서는 사용 후 브라우저 사이트 데이터를 삭제하세요.

> GitHub에 올리는 것만으로 API 키가 숨겨지지는 않습니다. 반드시 Vercel 같은 서버리스 환경에 배포하고 키를 환경변수로 등록해야 합니다.

## Vercel 배포

1. [OpenRouter Keys](https://openrouter.ai/settings/keys)에서 API 키를 만듭니다.
2. [Vercel](https://vercel.com/)에 GitHub 계정으로 로그인합니다.
3. **Add New → Project**에서 `mathlove22/gaon-eval` 저장소를 가져옵니다.
4. Framework Preset은 **Other**로 두고 배포합니다.
5. 프로젝트의 **Settings → Environment Variables**에 다음 값을 등록합니다.

| 이름 | 값 |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter에서 만든 `sk-or-v1-...` 키 |
| `APP_ACCESS_CODE` | 선생님들에게 따로 전달할 긴 접속 코드 |
| `OPENROUTER_MODEL` | `google/gemini-3.5-flash` |
| `PUBLIC_SITE_URL` | Vercel 배포 주소 |

6. 환경변수 저장 후 **Deployments → Redeploy**를 실행합니다.

PDF 분석은 1분 이상 걸릴 수 있습니다. Vercel 프로젝트의 **Settings → Functions**에서 Fluid Compute가 활성화되어 있는지 확인하세요. 이 저장소는 분석 함수의 최대 실행시간을 300초로 설정합니다.

API 키와 접속 코드는 절대로 GitHub 파일에 직접 입력하지 마세요. 예시는 `.env.example`에만 있으며 실제 `.env` 파일은 Git에서 제외됩니다.

## 사용 방법

1. 배포 주소를 열고 관리자가 공유한 교직원 접속 코드를 입력합니다.
2. 학년도·학기·과목 조건을 선택합니다.
3. 합계 3MB 이하 PDF 또는 이미지를 첨부하거나 텍스트를 입력합니다.
4. **자동 검토** 버튼을 누릅니다.

PDF는 OpenRouter의 네이티브 PDF 입력을 통해 Gemini에 전달됩니다. 첨부 합계 3MB 제한은 서버리스 요청 본문 크기를 안정적으로 지키기 위한 제한입니다.

긴 결과가 중간에 잘리지 않도록 규정·오류 분석과 성취기준 대조표 분석을 두 요청으로 나누어 동시에 처리한 뒤 서버에서 하나의 결과로 합칩니다. 따라서 단일 요청 방식보다 OpenRouter 입력 사용량이 늘어날 수 있습니다.

Gemini의 내부 추론 토큰이 JSON 출력 공간을 차지하지 않도록 추론 수준은 `minimal`로 설정합니다. 이 앱은 상세한 사고 과정 생성보다 PDF 표 판독과 정해진 스키마의 결과 반환을 우선합니다.

## 로컬 점검

```bash
npm test
```

실제 API 호출을 포함한 로컬 실행은 Vercel CLI와 `.env.local` 설정이 필요합니다.
