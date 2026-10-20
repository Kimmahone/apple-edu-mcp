# 유지보수와 배포

## 코드 변경

PR·push마다 GitHub CI가 타입·유닛·업데이트 도우미·빌드·새 MCP 연결·공개 파일 검사를 실행합니다. GitHub-hosted runner만 사용하며 개인 Mac을 공개 PR runner로 연결하지 않습니다. Dependabot은 주 1회 의존성과 Action 업데이트 PR을 제안하며 자동 병합하지 않습니다.

## 새 프로그램 릴리스

1. package.json·lock·resources와 버전 의존 검사에서 정식 버전을 함께 올립니다. 설치 경로의 launcher·dispatcher는 고정 계약을 유지합니다.
2. `npm ci && npm run typecheck && npm test && npm run test:distribution && npm run build && npm run test:mcp`를 실행합니다.
3. 관리자 Mac에서 `npm run verify:native`를 명시적으로 실행합니다. 기존 자료 대신 새로운 가상 작업공간에서 양쪽 iWork 6개 조합을 검사합니다. 오류나 시간 초과는 자동 반복하지 않습니다. `.local`의 비공개 결과를 먼저 확인하고, 이미 성공한 단계만 이어갈 때 `-- --run <기존 시험 폴더> --continue`를 사용합니다.
4. 생성된 `.release/native-verification.json`은 경로·내용을 제거한 공개 요약입니다. `npm run release:check -- --require-native`로 현재 코드의 지문과 비교합니다. 앱 버전을 바꿨다면 실제 설치 진단과 자산 검증을 다시 수행합니다.
5. 커밋·push 후 Actions → Release → Run workflow. 기본은 **초안만 생성**입니다. 검토한 릴리스를 게시할 때 publish=true를 지정하면 검사 통과 뒤 게시합니다. 태그 push도 초안을 생성합니다. 같은 버전의 공개 파일은 바꾸지 않고 새 버전을 발행합니다.
6. 다운로드한 ZIP을 별도 설치 폴더에서 설치·진단하고, 실제 AI 앱의 연결을 재시작해 확인합니다. 다른 Mac 시험은 별도로 기록합니다.

작업은 GitHub Releases에 tgz(실행 의존성 포함)·설치 ZIP·버전 명세·SHA256SUMS를 올립니다. npm 게시·사이트 배포는 하지 않습니다. GitHub Actions의 기본 권한은 읽기이고 릴리스 게시 작업에만 contents:write를 줍니다. 서명·공증된 Apple 앱으로 표현하지 않습니다.

## 예시 추가·변경

`examples/catalog.json`은 공개를 승인한 3개 팩의 파일명·크기·SHA-256·미리보기를 기록합니다. 원본은 Git 소스에 넣지 않습니다. 새 자료는 개인정보·학생정보·제3자 그림/교재 권리를 확인하고, 별도 승인한 폴더에서만 아래 작업을 합니다.

```sh
node scripts/examples/publish.mjs --asset-directory <공개 승인한 ZIP 폴더>
```

검사는 목록에 없는 파일을 업로드하지 않고 체크섬이 맞는 팩만 예시 릴리스에 올립니다. 새 팩·변경 팩은 새 예시 태그를 지정하고 catalog·갤러리를 갱신합니다. 같은 체크섬의 기존 자산은 다시 올리지 않습니다. 예시 릴리스는 프로그램의 Latest를 바꾸지 않습니다. 개인 Output을 자동 스캔하거나 업로드하는 주기 작업은 없습니다.
