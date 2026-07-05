# zzapcho Launcher Console

`zzapchoLauncher`의 프로필 manifest를 관리하는 별도 관리자 콘솔입니다.

런처 본체와 분리해서 관리합니다.

- 런처 레포: `zzapcho/zzapchoLauncher`
- 콘솔 레포: `zzapcho/zzapchoLauncherConsole`

## 구조

```txt
zzapchoLauncherConsole/
  console/      # React + Vite 관리자 웹 UI
  server/       # Express 관리자 API 서버
  shared/       # 프로필 타입과 manifest 검증 로직
```

## 왜 별도 레포인가?

런처 앱과 관리자 도구를 한 레포에 섞으면 빌드, 배포, 보안 설정이 지저분해집니다.

이 콘솔은 GitHub API로 `zzapcho/zzapchoLauncher`의 `src/data/profiles.json`을 수정합니다. GitHub 토큰은 반드시 서버의 `.env`에만 넣어야 합니다. 프론트엔드에 토큰을 넣으면 바로 털립니다.

## 실행

### 서버

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

`server/.env`를 수정합니다.

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=change-me-too

GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
GITHUB_REPO=zzapcho/zzapchoLauncher
GITHUB_BRANCH=codex/rounded-launcher-menu
GITHUB_MANIFEST_PATH=src/data/profiles.json

PORT=8787
```

### 콘솔 UI

```powershell
cd console
npm install
npm run dev
```

기본 주소:

- Console: `http://localhost:5173`
- API Server: `http://localhost:8787`

## 현재 기능

- 관리자 로그인
- 프로필 목록 조회
- 프로필 추가/복제/삭제
- 프로필 순서 변경
- 프로필 기본 정보 편집
- 서버 주소/포트 편집
- 모드/리소스팩/셰이더 항목 편집
- 유저 수정 허용 권한 편집
- JVM 메모리/javaArgs 편집
- manifest JSON 미리보기
- 저장 전 검증
- GitHub Contents API로 런처 레포의 `profiles.json` 업데이트

## 주의

`GITHUB_TOKEN`은 절대 `console/` 쪽에 넣지 마세요. `VITE_` 환경변수로도 넣지 마세요. 브라우저에 노출됩니다.

## 다음 단계

1. 런처 쪽 최종 프로필 스키마 확정
2. 런처가 원격 manifest URL을 읽도록 연결
3. 콘솔에서 배경 이미지 업로드/관리
4. 모드 파일 직접 업로드 또는 Modrinth 연동 강화
5. Cloudflare Worker/VPS 배포
6. 사용자별 권한/감사 로그 추가
