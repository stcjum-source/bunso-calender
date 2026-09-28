// ===== 분소 업무 달력 — 클라우드 설정 =====
// Supabase 프로젝트에서 복사한 값 두 개를 아래 따옴표 안에 붙여넣으세요.
// (Supabase 대시보드 → Project Settings → API 에서 확인)
// 값을 비워두면 로그인 없이 "이 기기에만 저장"되는 미리보기 모드로 동작합니다.
window.BUNSO_CONFIG = {
  SUPABASE_URL: "https://jbaesohbsobfsvqwydmg.supabase.co",   // (이미 채워둠) 웹앱과 동일
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiYWVzb2hic29iZnN2cXd5ZG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzExMDUsImV4cCI6MjEwNTY0NzEwNX0.ydeSQp1KAl__AQf2UfiWB7gHdLGcx1BwkWHv5auyhjM",   // ← 웹앱 config.js에 넣은 anon 키를 그대로 붙여넣기
  AUTO_LOCK_MINUTES: 15    // 15분 무조작 시 자동 잠금. 0이면 끔.
};
