# 선생님을 위한 설치 안내

## 준비하기

- Mac과 Pages·Numbers·Keynote. iPad 단독 설치·Windows 제작은 지원하지 않습니다.
- MCP 로컬 연결이 가능한 AI 앱: Claude Code·Codex·Antigravity 등. 웹 채팅만 켜는 것으로 Mac 앱이 연결되지는 않습니다.
- [Node.js 24 이상](https://nodejs.org/ko/download). 이 ZIP에 Node 자체를 포함하지는 않습니다.

유료 Apple 개발자 가입, npm 계정, sudo 명령은 MCP 설치에 필요하지 않습니다. 앱 이용권과 AI 서비스 요금은 별개입니다.

## 1. 설치 도우미 받기

[Apple-MCP-Installer.zip 다운로드](https://github.com/Kimmahone/apple-edu-mcp/releases/latest/download/Apple-MCP-Installer.zip)를 눌러 압축을 풉니다. GitHub 로그인 없이 받을 수 있습니다.

**설치하기.command**를 실행합니다. 홈 폴더에 **AppleMCP**가 생기고 프로그램과 **Workspace/Input·Output** 자료 폴더를 구분합니다. 같은 이름의 폴더에 기존 자료가 있으면 덮어쓰지 않고 중단합니다.

인터넷에서 받은 실행 파일이어서 macOS가 차단할 수 있습니다. 이 도우미는 Apple 서명·공증을 받은 앱이 아닙니다. 출처를 확인한 뒤 Terminal에 `bash `를 입력하고(뒤에 한 칸), **설치하기.command**를 창으로 끌어 놓은 뒤 Enter를 누르는 방법도 있습니다. 보안 설정을 끄거나 격리 속성을 자동 삭제하지 않습니다. 다른 Mac의 최초 다운로드 경고는 후속 실기 대상입니다.

## 2. AI 앱에 한 번 연결하기

**AppleMCP/설정_안내.md**를 엽니다. 이 컴퓨터에 맞는 Node 실행 경로와 `launcher.mjs` 절대 경로, 복사할 설정 예시가 생성됩니다.

AI 앱의 MCP 설정에서 `edu-apple-creator`를 연결합니다. 기존 Apple MCP가 있으면 새 항목을 더하지 말고 그 항목의 실행 경로만 바꿉니다. 다른 MCP 설정과 기존 자료 폴더는 그대로 둡니다. 설치 도우미는 설정을 자동 수정하지 않습니다.

- **Codex:** MCP 서버의 STDIO 명령·인수를 입력하거나 생성된 `[mcp_servers.edu-apple-creator]` 항목을 사용하고 연결을 재시작합니다. [공식 안내](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- **Claude Code:** 생성된 공통 JSON의 서버 항목만 기존 설정에 병합합니다. CLI는 `claude mcp add --transport stdio --scope user edu-apple-creator -- <Node 경로> <launcher.mjs 경로>` 형식입니다. 이미 등록되어 있다면 기존 항목을 편집하세요. [공식 안내](https://code.claude.com/docs/en/mcp)
- **Antigravity App·IDE:** 각각의 MCP 서버 관리에서 기존 JSON의 다른 서버는 유지하고 생성된 `mcpServers`의 Apple MCP 항목만 병합한 뒤 연결을 새로 고칩니다. 화면 이름은 버전에 따라 달라질 수 있습니다. [공식 안내](https://antigravity.google/docs/mcp)

앱이나 조직이 MCP 사용을 제한하면 해당 정책에 맞춰 연결을 허용해야 합니다.

## 3. 첫 요청하기

> 애플 MCP로 버전과 도구 수를 확인해 줘. 기존 자료는 건드리지 말고 가상 용돈 자료로 Numbers 수업 자료를 만들어 줘. 그림을 넣을 자리와 편집 가능한 용돈 계산표도 넣어 줘.

정상 연결은 **1.1.0 / 23개 도구**로 확인합니다. **진단하기.command**도 새 연결을 확인합니다. 진단은 문서를 열거나 자동화 권한을 요청하지 않으므로 제작 권한까지 통과했다는 의미는 아닙니다.

첫 제작 때 macOS가 “AI 앱이 Numbers를 제어하도록 허용하시겠습니까?”처럼 묻습니다. 앱 이름을 확인하고 직접 허용하세요. Pages·Keynote에도 각각 필요할 수 있습니다. 기본 설치는 접근성·전체 디스크 접근을 요구하지 않습니다.

## 자료 넣기와 업데이트

그림·템플릿 사본은 **AppleMCP/Workspace/Input**, 새 결과와 수정본은 **Output**을 사용합니다. 학생 개인정보를 AI에 전달하는 범위는 사용하는 AI 서비스의 정책을 확인하고 결정하세요. 이 MCP는 문서를 자동 업로드하지 않지만 AI 대화의 완전한 로컬 처리를 보장하지는 않습니다.

도우미의 **업데이트 확인.command → 업데이트하기.command**를 실행하면 검증을 통과한 새 버전으로 바뀝니다. 자료와 연결 경로는 유지됩니다. 끝나면 AI 앱의 MCP 연결을 다시 시작하세요. 문제가 생기면 이전에 성공한 설치가 있을 때 **이전 버전으로.command**를 사용할 수 있습니다. [업데이트 설명](UPDATES.md)

## 잘 안될 때

| 상황 | 할 일 |
|---|---|
| Node를 못 찾음 | Node.js 24 이상 설치 후 도우미 창을 다시 엽니다. |
| 예전 버전이 보임 | AI 앱의 MCP 연결을 재시작하고 계속되면 앱을 완전히 종료·재실행합니다. |
| 자동화 권한 거부 | macOS 개인정보 보호 및 보안 → 자동화에서 현재 AI 앱과 대상 앱을 확인합니다. |
| 14.5에서 새 버전 안내가 뜸 | 구형 앱을 계속 시험하려면 ‘지금 안 함’을 직접 누르고 가상 파일 상태를 확인합니다. 앱 삭제·업데이트를 누르지 않습니다. 미확정 요청은 자동 반복하지 않습니다. |
| 다운로드 실패 | 기존 버전을 계속 쓰고 네트워크가 복구된 뒤 다시 업데이트합니다. |
| 다른 설치가 진행 중 | 다른 설치 창을 확인합니다. 강제 종료된 경우 `.update.lock`의 PID를 확인하고 실행 중인 설치가 없을 때 그 잠금 파일만 수동 제거합니다. |
| 문서 결과가 불명확 | 새 요청으로 즉시 반복하지 말고 AI에게 해당 requestId 상태와 Output을 확인하게 합니다. |
