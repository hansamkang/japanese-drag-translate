# AGENTS

## Project Goal

`일본어 드래그 번역`은 웹페이지에서 일본어 텍스트를 드래그하면 한국어 번역 팝업을 보여주는 Chrome 확장 프로그램입니다.

영문 프로젝트명은 `japanese-drag-translate`입니다.

## Current Features

* 일본어 드래그 감지
* 한국어 번역 표시
* 히라가나 읽는법 표시
* 네이버 일본어 사전 버튼
* 선택 텍스트 복사 기능
* 팝업 하단 광고 영역
* 광고 데이터 `ads.json` 분리

## Development Rules

* Chrome Extension Manifest V3를 유지합니다.
* UI는 가볍고 단순하게 유지합니다.
* 번역 기능을 항상 최우선으로 유지합니다.
* 불필요한 라이브러리는 추가하지 않습니다.
* 읽는법은 로컬 `kuromoji.js` 사전 기반으로 처리하고 외부 읽기 API를 사용하지 않습니다.
* 한국어 사용자 UX를 우선합니다.

## UI Rules

* 팝업은 작고 읽기 쉽게 유지합니다.
* 광고는 팝업 하단에만 표시합니다.
* 광고 오류가 번역 기능을 막으면 안 됩니다.
* 작은 아이콘에서도 핵심 글자가 잘 보여야 합니다.

## Future Features

* 단어장 저장
* JLPT 레벨 표시
* 예문 표시
* 사용자 설정

## Git Workflow

작업 완료 시:

1. 변경사항 확인
2. `git add .`
3. `git commit` 작성

커밋 메시지 규칙:

* `feat:`
* `fix:`
* `refactor:`
* `docs:`
