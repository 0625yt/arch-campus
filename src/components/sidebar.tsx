// 사이드바는 GlobalTopbar로 대체됐다 (2026-05-31). 강의 트리가 사라져
// 외부 broadcast가 필요 없어졌다 — 호출자들은 이미 router.refresh()를 같이 부르고 있어
// 데이터 갱신은 그쪽이 책임진다. 이 stub은 import 경로 호환을 위해서만 남는다.
export function pingSidebarCourses(): void {
  /* noop */
}
