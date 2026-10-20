# 지원 범위와 검증 기준

v1은 **현재 개발 Mac에서 검증한 iWork** 범위입니다. 다른 Mac·교사 설치·iPad 실기는 환경 준비 대기입니다. 공개 배포가 모든 기기 검증을 뜻하지는 않습니다.

| 앱 | 검증한 버전 | 작업과 한계 |
|---|---|---|
| Numbers | classic 14.5 / Creator Studio 15.2.1 | 여러 시트의 글·표·도형·그림·제한형 수식. 임의 수식·교차 표 참조·외부 데이터 미지원. 캔버스 도구의 도형 채우기·테두리 미지원. |
| Keynote | classic 14.5 / Creator Studio 15.3.1 | 다장·발표자 노트·그림·표·도형, Studio 차트·일부 전환. 임의 객체 애니메이션·외부 차트 직접 수정 미지원. |
| Pages | classic 14.5 / Creator Studio 15.3.1 | A4 레이아웃·실제 본문·문단·쪽별 표·그림. 외부 문서는 단일 구역 본문의 글 구간·서체·크기·색 편집. 고급 인쇄·구역 전체 편집 미지원. |

새 제작과 수정은 저장·닫기·재열기로 요소·수식을 확인합니다. 템플릿은 지정 파일의 사본으로 수정하고 원본을 보존합니다. 시각·인쇄·모션 품질은 구조 검사와 별도이며 “verified”가 완벽한 디자인을 보증하지 않습니다.

요청 한 번은 최대12쪽/시트/슬라이드·120객체·2,000셀입니다. PNG/JPEG은16MP·10MiB 이하로 원본 비율을 유지합니다. 그룹·잠긴 객체·복잡한 템플릿은 조회·보존이 우선입니다. 공개 예시에는 추가 공개 앱 API와 화면 검수도 사용되었습니다. 모든 예시 요소를 단일 MCP 호출로 자동 완성한다는 뜻은 아닙니다.

## 23개 도구

- 상태·계획: `eduapple_progress`, `eduapple_doctor`, `eduapple_capabilities`, `eduapple_plan`, `eduapple_authoring_guide`, `eduapple_lesson_plan`
- iWork 권한·기본 제작: `eduapple_request_automation_permission`, `eduapple_create_keynote`, `eduapple_create_pages`, `eduapple_create_numbers`, `eduapple_verify`
- 다중 요소: `eduapple_create_canvas`, `eduapple_inspect_artifact`, `eduapple_edit_artifact`
- 템플릿: `eduapple_inspect_template`, `eduapple_edit_template`
- Studio: `eduapple_studio_create`, `eduapple_studio_inspect`, `eduapple_studio_edit`
- 후속 앱: `eduapple_creator_access`, `eduapple_creator_request_permission`, `eduapple_create_freeform`, `eduapple_freeform_status`

자연어 해석은 호스트 AI가 맡습니다. 수정 전 현재 요소와 revision을 조회합니다. 같은 requestId·같은 입력은 기존 결과를 반환하고 입력이 다르면 충돌로 중단합니다. 미확정 결과를 새 ID로 재실행하지 않습니다. 초기 단순 제작3개 도구에는 이 ID 중복 방지 계약이 없으므로 일반 제작은 create_canvas·studio_create를 우선합니다.

Freeform은 전용 단축어·opt-in을 통한 빈 보드 생성·첫 열기만 제한 지원하며 영구 ID·재열기·보드 요소를 자동 검증하지 않습니다. Pixelmator는 제한형 새 레이어 원본 제작입니다. Final Cut은 FCPXML, Logic은 MIDI/MusicXML 교환 자료 중심으로 실제 앱 가져오기·네이티브 저장에 수동 단계가 있습니다. 이 네 앱은 iWork v1 지원 보증 범위에서 제외하고 천천히 업데이트합니다.

[공개 네이티브 검증 요약](../.release/native-verification.json)에는 개인 경로·문서 내용·가상 ID·설정이 없습니다. 공개 CI는 이 증거와 배포 코드의 지문 일치를 확인하며 Mac 앱 실기를 대신하지 않습니다.
