"use strict";
const pages = {
  overview: "대시보드",
  requests: "신청 목록",
  loans: "대여·반납",
  stock: "물품·고유번호",
  people: "지각·대여 제한",
  stats: "이용 통계",
  settings: "운영 설정",
  staff: "임원 연락처",
  audit: "작업 이력",
};
const page = () =>
    Object.hasOwn(pages, location.hash.slice(1))
        ? location.hash.slice(1)
        : "overview";
let data,
    query = "",
    filter = "",
    itemFilter = "",
    start = "",
    end = "",
    period = "day",
    charts = [],
    busy = false,
    loading = false;
const metric = (title, value) =>
    '<div class="card metric"><small>' +
    esc(title) +
    "</small><strong>" +
    esc(value) +
    "</strong></div>";
const empty = (msg) => '<p class="empty">' + esc(msg) + "</p>";
const record = (title, info, action = "") =>
    '<article class="record"><div><h3>' +
    esc(title) +
    "</h3><small>" +
    esc(info) +
    "</small></div>" +
    action +
    "</article>";
const status = (l) =>
    !l.returned
        ? "대여 중"
        : (l.deposit_received && !l.deposit_back) ||
        (l.card_received && !l.card_back)
            ? "반환 대기"
            : "반환 완료";
const unitsOf = (id) => data.units.filter((u) => u.item_id == id);
const titleOf = (id) => data.home.items.find((i) => i.id == id)?.title;
function overview() {
  const loans = data.loans,
      day = data.home.now.slice(0, 10);
  return (
      '<div class="metrics">' +
      metric("오늘 신청", data.todayRequests) +
      metric("신청 대기", data.requests.length) +
      metric("반환 대기", loans.filter((l) => status(l) === "반환 대기").length) +
      metric("현재 대여 중", loans.filter((l) => !l.returned).length) +
      metric("오늘 승인", loans.filter((l) => l.issued.startsWith(day)).length) +
      metric(
          "기한 경과",
          loans.filter((l) => !l.returned && l.due < data.home.now).length,
      ) +
      "</div><h2>최근 신청</h2>" +
      requestList(data.requests.slice(0, 5)) +
      weekSummary() +
      '<h2>업무 바로가기</h2><div class="chips">' +
      ["requests", "loans", "stock", "stats"]
          .map((k) => '<a class="btn" href="#' + k + '">' + pages[k] + "</a>")
          .join("") +
      "</div>"
  );
}
const matches = (r) =>
    [r.name, r.student_no, r.phone, r.title, r.codes, r.officer].some((v) =>
        String(v || "").includes(query),
    );
const requestList = (list) =>
    list
        .map((r) =>
            record(
                r.title + " · " + r.name,
                r.student_no + " · " + fmt(r.created),
                btn("신청 상세", "requestDetail(" + r.id + ")"),
            ),
        )
        .join("") || empty("대기 중인 신청이 없습니다.");
const search = () =>
    '<label>검색<input id="search" type="search" value="' +
    esc(query) +
    '" placeholder="이름, 학번, 물품 등"></label>';
function requestDetail(id) {
  let r = data.requests.find((r) => r.id === id);
  if (!r) return notice("이미 처리된 신청입니다.");
  let units = unitsOf(r.item_id).filter((u) => u.state === "AVAILABLE");
  popup(
      "<h2>신청 상세</h2>" +
      pair("물품", r.title) +
      pair("이름 · 학번", r.name + " · " + r.student_no) +
      pair("소속", r.faculty + " / " + r.department) +
      pair("전화번호", r.phone) +
      pair("신청 시각", fmt(r.created)) +
      '<form data-path="approve/' +
      id +
      '"><h3>배정할 고유번호</h3><div class="chips">' +
      (units
          .map(
              (u) =>
                  '<label class="check"><input type="checkbox" name="units" value="' +
                  u.id +
                  '">' +
                  esc(u.code) +
                  "</label>",
          )
          .join("") || empty("가용 재고가 없습니다.")) +
      "</div>" +
      select(
          "staff",
          "담당 임원",
          opt("", "담당자 선택") +
          data.staff.map((s) => opt(s.id, s.name)).join(""),
      ) +
      '<label>비고<textarea name="memo" maxlength="500" placeholder="예: 야구공 1개"></textarea></label>' +
      check("deposit", "현금 보증금 수령", false) +
      check("card", "실물 신분증 수령") +
      check("exception", "미제출 예외 승인") +
      '<label class="exception-reason" hidden>미제출 사유<input name="exceptionReason" maxlength="180"></label>' +
      '<p class="error" role="status" aria-live="polite" data-approval-feedback>' +
      esc(data.home.closed ? approvalHoursMessage(data.home.closed) : "") +
      '</p><button type="submit" class="primary wide">대여 승인</button></form>' +
      btn("신청 삭제", "cancelRequest(" + id + ")", "wide"),
  );
}
function approvalHoursMessage(reason) {
  const policy = data.home.policy;
  return reason + " · 운영 시간 " + policy.opens.slice(0, 5) + "–" + policy.closes.slice(0, 5) + "에 승인할 수 있습니다.";
}

function approvalFeedback(form, message) {
  const feedback = form.querySelector("[data-approval-feedback]");
  feedback.textContent = message;
  feedback.scrollIntoView({ block: "nearest" });
}

// Native constraint validation runs before submit, including when the dialog is scrolled.
document.addEventListener("invalid", (event) => {
  const control = event.target;
  const form = control.closest('form[data-path^="approve/"]');
  if (!form || form.querySelector(":invalid") !== control) return;
  const messages = {
    staff: "담당 임원을 선택해 주세요.",
    deposit: "현금 보증금 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    card: "실물 신분증 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    exceptionReason: "미제출 사유를 입력해 주세요.",
  };
  approvalFeedback(form, messages[control.name] || control.validationMessage);
}, true);

document.addEventListener("change", (e) => {
  const f = e.target.closest('form[data-path^="approve/"]');
  if (!f) return;
  const exception = f.elements.exception.checked;
  f.elements.deposit.required = f.elements.card.required = !exception;
  f.querySelector(".exception-reason").hidden = !exception;
  f.elements.exceptionReason.required =
      exception && (!f.elements.deposit.checked || !f.elements.card.checked);
});
function cancelRequest(id) {
  if (confirm("이 대기 신청을 삭제할까요?")) mutate("action/cancel", { id });
}
function loanList() {
  const list = data.loans.filter(
      (l) =>
          matches(l) &&
          (!filter ||
              status(l) === filter ||
              (filter === "지각" && l.late) ||
              (filter === "기한 경과" && !l.returned && l.due < data.home.now)),
  );
  return (
      search() +
      '<fieldset class="status-filter"><legend>처리 상태</legend><div>' +
      ["","대여 중","기한 경과","지각","반환 대기","반환 완료"].map(value=>
          '<label><input type="radio" name="status" value="'+value+'" '+(filter===value?'checked':'')+'><span>'+(value||"전체")+'</span></label>'
      ).join("")+'</div></fieldset>' +
      list
          .map((l) =>
              record(
                  l.title + " · " + l.name,
                  status(l) + " · " + l.codes + " · 반납 기한 " + fmt(l.due),
                  btn("상세 보기", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") +
      (list.length ? "" : empty("표시할 대여 기록이 없습니다."))
  );
}
function loanDetail(id) {
  let l = data.loans.find((l) => l.id === id);
  let body =
      "<h2>대여 #" +
      id +
      "</h2>" +
      pair("상태", status(l)) +
      pair("물품", l.title) +
      pair("고유번호", l.codes) +
      pair("학생", l.name + " · " + l.student_no) +
      pair("전화번호", l.phone) +
      pair("담당 임원", l.officer) +
      pair("비고", l.memo || "—") +
      pair("보증금 수령", l.deposit_received ? "수령" : "미제출") +
      pair("실물 신분증 수령", l.card_received ? "수령" : "미제출") +
      (l.exception_reason ? pair("미제출 사유", l.exception_reason) : "") +
      pair("승인 시각", fmt(l.issued)) +
      pair("반납 기한", fmt(l.due));
  if (l.returned)
    body +=
        pair("실제 반납", fmt(l.returned)) +
        pair("판정", l.late ? "지각" : "정상") +
        pair(
            "보증금 반환",
            !l.deposit_received ? "해당 없음" : l.deposit_back ? "완료" : "미반환",
        ) +
        pair(
            "신분증 반환",
            !l.card_received ? "해당 없음" : l.card_back ? "완료" : "미반환",
        );
  if (status(l) !== "반환 완료")
    body +=
        '<form data-path="' +
        (l.returned ? "action/settle" : "return/" + id) +
        '"><input type="hidden" name="id" value="' +
        id +
        '">' +
        (l.deposit_received
            ? check("deposit", "보증금 반환 완료", l.deposit_back, true)
            : "") +
        (l.card_received
            ? check("card", "신분증 반환 완료", l.card_back, true)
            : "") +
        '<button class="primary wide">' +
        (l.returned ? "반환 확인 저장" : "선택한 대여 건 전체 반납") +
        "</button></form>";
  if (l.returned)
    body +=
        '<details><summary>지각 기록 정정</summary><form data-path="action/correct"><input type="hidden" name="id" value="' +
        id +
        '">' +
        check("late", "지각으로 기록", l.late) +
        field("reason", "정정 사유", "", "text", 'required maxlength="180"') +
        "<button>정정 저장</button></form></details>";
  popup(body);
}
function weekSummary() {
  const day = data.home.now.slice(0, 10),
      daily = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - back);
    const key = date.toISOString().slice(0, 10);
    daily.push([
      key,
      data.loans.filter((l) => l.issued.startsWith(key)).length,
    ]);
  }
  const recent = data.loans.filter((l) => l.issued.slice(0, 10) >= daily[0][0]);
  const items = data.home.items
      .map((i) => [i.title, recent.filter((l) => l.item_id === i.id).length])
      .sort((a, b) => b[1] - a[1]);
  return (
      '<section class="panel week-report"><h2>최근 7일 대여 현황</h2>' +
      pair(
          "최다 대여 물품",
          recent.length
              ? items[0][0] + " · " + items[0][1] + "건"
              : "대여 기록 없음",
      ) +
      '<div class="week">' +
      daily
          .map(
              ([d, n]) =>
                  "<div><strong>" +
                  n +
                  "</strong><small>" +
                  d.slice(5) +
                  "</small></div>",
          )
          .join("") +
      "</div><details><summary>물품별 승인 건수</summary>" +
      items.map(([k, v]) => pair(k, v + "건")).join("") +
      "</details></section>"
  );
}
function historyOfUnit(id) {
  const u = data.units.find((u) => u.id === id);
  let loans = data.loans.filter((l) => l.codes.split(", ").includes(u.code));
  popup(
      "<h2>" +
      esc(u.code) +
      " 대여 이력</h2>" +
      (loans
          .map((l) =>
              record(
                  l.name,
                  fmt(l.issued) + " · " + status(l),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("대여 이력이 없습니다.")),
  );
}
function itemEditor(id = 0) {
  const item = data.home.items.find((i) => i.id === id);
  popup(
      "<h2>" +
      (item ? "물품 수정" : "새 물품 등록") +
      '</h2><form data-path="catalog"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "title",
          "물품 이름",
          item?.title || "",
          "text",
          'required maxlength="80"',
      ) +
      field(
          "quantity",
          item ? "추가할 수량" : "초기 수량",
          item ? 0 : 1,
          "number",
          'required min="' + (item ? 0 : 1) + '" max="500"',
      ) +
      select(
          "nextDay",
          "반납 기준",
          opt("false", "대여 당일", !item?.next_day) +
          opt("true", "대여 다음 날", item?.next_day),
      ) +
      '<label>물품 사진 · JPG 또는 PNG, 최대 5MB<input type="file" name="photo" accept="image/png,image/jpeg"></label><button class="primary wide">저장</button></form>'+ (item?btn("이 물품 삭제","deleteItem("+id+")","wide"):""),
  );
}
function deleteItem(id){
  if(confirm(titleOf(id)+"을 대여 목록에서 삭제할까요? 기존 대여 기록은 보존됩니다."))mutate("action/delete-item",{id});
}
function stock() {
  return (
      btn("새 물품 등록", "itemEditor()", "primary") +
      '<div class="catalog-list">' +
      data.home.items
          .map((i) =>
              record(
                  i.title,
                  "전체 " +
                  i.total +
                  "개 · 대여 가능 " +
                  i.available +
                  "개 · 대여 중 " +
                  i.rented +
                  "개 · 사용 불가 " +
                  (i.total - i.available - i.rented) +
                  "개",
                  '<div class="row-actions">'+btn("물품 수정", "itemEditor(" + i.id + ")") +
                  btn("고유번호 관리", "stockDetail(" + i.id + ")")+"</div>",
              ),
          )
          .join("") +
      "</div>"
  );
}
function stockDetail(id) {
  let labels = {
    AVAILABLE: "대여 가능",
    OUT: "대여 중",
    DISABLED: "사용 불가",
  };
  popup(
      "<h2>" +
      esc(titleOf(id)) +
      "</h2>" +
      unitsOf(id)
          .map((u) =>
              record(
                  u.code,
                  labels[u.state],
                  '<div class="unit-actions">' +
                  btn("이력", "historyOfUnit(" + u.id + ")") +
                  (u.state === "OUT"
                      ? ""
                      : '<div class="chips">' +
                      btn(
                          u.state === "DISABLED" ? "복구" : "사용 불가",
                          "unitAction(" + u.id + ",false)",
                      ) +
                      btn("삭제", "unitAction(" + u.id + ",true)") +
                      "</div>") +
                  "</div>",
              ),
          )
          .join("") +
      '<form data-path="action/add-unit"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field("code", "새 고유번호", "", "text", 'maxlength="32" required') +
      '<button class="primary wide">고유번호 등록</button></form>',
  );
}
function unitAction(id, remove) {
  if (!remove || confirm("고유번호를 삭제할까요?"))
    mutate("action/" + (remove ? "remove-unit" : "unit"), { id });
}
function people() {
  let list = data.borrowers.filter(matches);
  return (
      search() +
      list
          .map((b) =>
              record(
                  b.name + " · " + b.student_no,
                  "누적 지각 " +
                  b.late_count +
                  "회 · " +
                  (b.suspended ? "정지" : "신청 가능"),
                  btn(
                      "관리",
                      "person(" + JSON.stringify(b.student_no).replaceAll('"', "'") + ")",
                  ),
              ),
          )
          .join("") +
      (list.length ? "" : empty("학생 기록이 없습니다."))
  );
}
async function person(no) {
  const b = data.borrowers.find((b) => b.student_no === no);
  let history;
  try {
    history = await api("admin/borrowers/" + no + "/history");
  } catch (e) {
    report(e);
    return;
  }
  popup(
      "<h2>" +
      esc(b.name) +
      " · 대여 제한</h2>" +
      pair("누적 지각", b.late_count + "회") +
      '<form data-path="action/restriction"><input type="hidden" name="id" value="0"><input type="hidden" name="studentNo" value="' +
      no +
      '">' +
      check("suspend", "대여 제한 적용", b.suspended) +
      field("reason", "처리 사유", "", "text", 'required maxlength="180"') +
      '<button class="primary wide">상태 저장</button></form><h3>처리 사유와 이력</h3>' +
      (history
          .map((e) => record(e.detail, fmt(e.happened) + " · " + e.actor))
          .join("") || empty("처리 이력이 없습니다.")) +
      "<h3>지각 대여 기록</h3>" +
      (data.loans
          .filter((l) => l.student_no === no && l.late)
          .map((l) =>
              record(
                  l.title,
                  fmt(l.returned),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("지각 이력이 없습니다.")),
  );
}
function settings() {
  const p = data.home.policy;
  return (
      '<section class="panel"><h2>정기 운영</h2><form data-path="action/policy"><div class="chips">' +
      [..."월화수목금토일"]
          .map(
              (s, i) =>
                  '<label class="check"><input type="checkbox" name="days" value="' +
                  (i + 1) +
                  '" ' +
                  (p.weekdays.includes(i + 1) ? "checked" : "") +
                  ">" +
                  s +
                  "</label>",
          )
          .join("") +
      '</div><div class="formgrid">' +
      field("opens", "시작 시각", p.opens, "time", "required") +
      field("closes", "종료 시각", p.closes, "time", "required") +
      "</div>" +
      '<button class="primary">운영 설정 저장</button></form></section><section class="panel"><h2>대여 중단 기간</h2>' +
      data.home.closures
          .map((c) =>
              record(
                  c.reason,
                  c.starts + " ~ " + c.ends,
                  btn("기간 삭제", "removeClosure(" + c.id + ")"),
              ),
          )
          .join("") +
      '<form data-path="action/closure"><div class="formgrid">' +
      field("starts", "시작일", "", "date", "required") +
      field("ends", "종료일", "", "date", "required") +
      "</div>" +
      field("reason", "중단 사유", "", "text", 'required maxlength="180"') +
      "<button>중단 기간 등록</button></form></section>"
  );
}
function removeClosure(id) {
  if (confirm("중단 기간을 삭제할까요?")) mutate("action/end-closure", { id });
}
function officer(id) {
  const s = data.staff.find((s) => s.id === id);
  popup(
      '<h2>임원 연락처 수정</h2><form data-path="action/staff"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "name",
          "당직표에 쓰인 이름",
          s.name,
          "text",
          'required maxlength="50"',
      ) +
      field(
          "phone",
          "전화 연결 번호",
          s.phone,
          "tel",
          'placeholder="010-0000-0000"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function account(id) {
  popup(
      "<h2>임원 로그인 설정</h2>" +
      pair("개인 아이디", "staff" + id) +
      '<form data-path="action/password"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "password",
          "새 비밀번호",
          "",
          "password",
          'required minlength="8" autocomplete="new-password"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function statistics() {
  return (
      '<div class="panel"><div class="formgrid">' +
      field("start", "시작일", start, "date") +
      field("end", "종료일", end, "date") +
      select(
          "itemFilter",
          "물품",
          opt("", "전체") +
          data.home.items
              .map((i) => opt(i.id, i.title, i.id == itemFilter))
              .join(""),
      ) +
      select(
          "period",
          "집계 단위",
          [
            ["day", "일별"],
            ["week", "주별"],
            ["month", "월별"],
          ]
              .map(([k, v]) => opt(k, v, k === period))
              .join(""),
      ) +
      '</div></div><div id="figures"></div>'
  );
}
function plot() {
  charts.forEach((c) => c.destroy());
  charts = [];
  const list = data.loans.filter(
      (l) =>
          (!itemFilter || l.item_id == itemFilter) &&
          (!start || l.issued.slice(0, 10) >= start) &&
          (!end || l.issued.slice(0, 10) <= end),
  );
  const done = list.filter((l) => l.returned),
      late = done.filter((l) => l.late).length;
  const minute = (v) => Date.parse(v + "+09:00") / 60000;
  const avg = done.length
      ? Math.round(
          done.reduce(
              (sum, l) => sum + minute(l.returned) - minute(l.issued),
              0,
          ) / done.length,
      )
      : 0;
  const counts = (key, initial = {}) =>
      list.reduce((m, l) => {
        const k = key(l);
        m[k] = (m[k] || 0) + 1;
        return m;
      }, initial);
  const trend = counts((l) => {
    let day = l.issued.slice(0, 10);
    if (period === "month") return day.slice(0, 7);
    if (period === "week") {
      const d = new Date(day + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    }
    return day;
  });
  const ordered = Object.fromEntries(
      Object.entries(trend).sort(([a], [b]) => a.localeCompare(b)),
  );
  const byItem = counts(
      (l) => l.title,
      Object.fromEntries(data.home.items.map((i) => [i.title, 0])),
  );
  const weekdays = counts(
      (l) =>
          "일월화수목금토"[
              new Date(l.issued.slice(0, 10) + "T00:00:00Z").getUTCDay()
              ],
      Object.fromEntries([..."월화수목금토일"].map((v) => [v, 0])),
  );
  const blocks = [
    "00–06시",
    "06–09시",
    "09–12시",
    "12–15시",
    "15–18시",
    "18–24시",
  ];
  const times = counts(
      (l) =>
          blocks[
              [6, 9, 12, 15, 18, 24].findIndex(
                  (end) => Number(l.issued.slice(11, 13)) < end,
              )
              ],
      Object.fromEntries(blocks.map((b) => [b, 0])),
  );
  const palette = [
    "#2e3955",
    "#638287",
    "#829aba",
    "#8d7787",
    "#bac8aa",
    "#9faad0",
    "#b99577",
    "#718c69",
  ];
  const legend = Object.keys(byItem)
      .map(
          (name, i) =>
              '<li><i style="background:' +
              palette[i % palette.length] +
              '"></i>' +
              esc(name) +
              "</li>",
      )
      .join("");
  const graphs = [
    ["대여 추이", "line", ordered],
    ["물품별 대여 횟수", "bar", byItem],
    ["물품별 이용 비율", "doughnut", byItem],
    ["요일별 이용", "bar", weekdays],
    ["시간대별 이용", "bar", times],
  ];
  $("#figures").innerHTML =
      '<div class="metrics">' +
      metric("승인 건수", list.length) +
      metric("평균 이용 시간", avg + "분") +
      metric("미반납", list.length - done.length) +
      metric("반환 대기", done.filter((l) => status(l) === "반환 대기").length) +
      "</div>" +
      pair(
          "지각 건수 / 반납 대비 비율",
          late +
          "건 / " +
          (done.length ? ((100 * late) / done.length).toFixed(1) : 0) +
          "%",
      ) +
      '<div class="charts">' +
      graphs
          .map(
              ([name, type, series], i) =>
                  '<section class="card"><h3>' +
                  name +
                  '</h3><div class="plot-area"><canvas id="graph' +
                  i +
                  '" aria-label="' +
                  name +
                  '"></canvas></div>' +
                  (type === "doughnut"
                      ? '<ul class="plot-key">' + legend + "</ul>"
                      : "") +
                  "<details><summary>수치 보기</summary>" +
                  Object.entries(series)
                      .map(([k, v]) => pair(k, v + "건"))
                      .join("") +
                  "</details></section>",
          )
          .join("") +
      "</div>";
  if (window.Chart) Chart.defaults.font.family = "Pretendard, sans-serif";
  if (window.Chart)
    graphs.forEach(([name, type, series], i) =>
        charts.push(
            new Chart($("#graph" + i), {
              type,
              data: {
                labels: Object.keys(series),
                datasets: [
                  {
                    label: name,
                    data: Object.values(series),
                    borderColor: "#536986",
                    backgroundColor:
                        type === "doughnut"
                            ? [
                              "#2e3955",
                              "#638287",
                              "#829aba",
                              "#8d7787",
                              "#bac8aa",
                              "#9faad0",
                              "#b99577",
                              "#718c69",
                            ]
                            : "#7088a9",
                  },
                ],
              },
              options: {
                animation: false,
                maintainAspectRatio: false,
                indexAxis: i === 1 ? "y" : "x",
                scales:
                    type === "doughnut"
                        ? {}
                        : {
                          x: {
                            ticks: {
                              maxRotation: 0,
                              minRotation: 0,
                              autoSkip: true,
                              maxTicksLimit: 8,
                            },
                          },
                          y: { ticks: { precision: 0 } },
                        },
                plugins: { legend: { display: false } },
              },
            }),
        ),
    );
}
function render() {
  if (!data) return;
  charts.forEach((c) => c.destroy());
  charts = [];
  const p = page();
  $("#tabs").innerHTML = Object.entries(pages)
      .map(
          ([k, v]) =>
              '<a href="#' +
              k +
              '" class="' +
              (k === p ? "on" : "") +
              '">' +
              v +
              "</a>",
      )
      .join("");
  let content = {
    overview,
    requests: () => search() + requestList(data.requests.filter(matches)),
    loans: loanList,
    stock,
    people,
    settings,
    stats: statistics,
    staff: () =>
        "<p>월별 당직표의 이름과 일치하는 임원에게 연결됩니다. 전화번호를 등록하면 학생 화면의 전화 버튼이 활성화됩니다. 대표 관리자는 개인 로그인도 설정할 수 있습니다.</p>" +
        data.staff
            .map((s) =>
                record(
                    s.name,
                    s.phone || "번호 미등록",
                    '<div class="staff-actions row-actions">'+btn("수정", "officer(" + s.id + ")") +
                    ($("aside").dataset.master === "true"
                        ? btn("계정 설정", "account(" + s.id + ")")
                        : "")+"</div>",
                ),
            )
            .join(""),
    audit: () =>
        data.audit
            .map((a) => record(a.detail, fmt(a.happened) + " · " + a.actor))
            .join("") || empty("아직 기록된 작업이 없습니다."),
  }[p]();
  app.innerHTML =
      '<div class="sectiontitle"><h1>' +
      pages[p] +
      "</h1><small>" +
      fmt(data.home.now) +
      " 기준</small></div>" +
      content;
  if ($("#search"))
    $("#search").oninput = (e) => {
      query = e.target.value;
      render();
      $("#search").focus();
    };
  app.querySelectorAll('.status-filter input').forEach(input=>{
    input.onchange=()=>{
      filter=input.value;
      render();
      app.querySelector('.status-filter input:checked').focus({preventScroll:true});
    };
  });
  if (p === "stats") {
    plot();
    for (const name of ["start", "end", "itemFilter", "period"])
      app.querySelector("[name=" + name + "]").onchange = (e) => {
        const v = e.target.value;
        if (name === "start") start = v;
        if (name === "end") end = v;
        if (name === "itemFilter") itemFilter = v;
        if (name === "period") period = v;
        plot();
      };
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await api("admin/desk");
    render();
  } catch (e) {
    report(e);
  } finally {
    loading = false;
  }
}
async function mutate(path, form) {
  if (busy) return;
  busy = true;
  try {
    await api("admin/" + path, form);
    if (modal.open) modal.close();
    await refresh();
    notice("저장했습니다.");
  } catch (e) {
    report(e);
  } finally {
    busy = false;
  }
}
async function approveRequest(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!form.querySelector('[name="units"]:checked')) {
    approvalFeedback(form, "배정할 고유번호를 하나 이상 선택해 주세요.");
    return;
  }
  button.disabled = true;
  button.textContent = "승인 중…";
  try {
    await api("admin/" + form.dataset.path, new FormData(form));
    if (form.isConnected && modal.open) modal.close();
    await refresh();
    notice("대여를 승인했습니다.");
  } catch (error) {
    if (form.isConnected) approvalFeedback(form, error.message === "운영 시간 외" ? approvalHoursMessage(error.message) : error.message);
  } finally {
    button.disabled = false;
    button.textContent = "대여 승인";
  }
}

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-path]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.path.startsWith("approve/")) {
    approveRequest(form);
    return;
  }
  mutate(form.dataset.path, new FormData(form));
});
window.addEventListener("hashchange", () => {
  query = "";
  filter = "";
  window.scrollTo(0, 0);
  render();
  refresh();
});
refresh();
setInterval(() => {
  if (
      !document.hidden &&
      !modal.open &&
      !busy &&
      ["overview", "requests", "loans"].includes(page()) &&
      !["INPUT", "SELECT"].includes(document.activeElement.tagName)
  )
    refresh();
}, 3000);
"use strict";
const pages = {
  overview: "대시보드",
  requests: "신청 목록",
  loans: "대여·반납",
  stock: "물품·고유번호",
  people: "지각·대여 제한",
  stats: "이용 통계",
  settings: "운영 설정",
  staff: "임원 연락처",
  audit: "작업 이력",
};
const page = () =>
    Object.hasOwn(pages, location.hash.slice(1))
        ? location.hash.slice(1)
        : "overview";
let data,
    query = "",
    filter = "",
    itemFilter = "",
    start = "",
    end = "",
    period = "day",
    charts = [],
    busy = false,
    loading = false;
const metric = (title, value) =>
    '<div class="card metric"><small>' +
    esc(title) +
    "</small><strong>" +
    esc(value) +
    "</strong></div>";
const empty = (msg) => '<p class="empty">' + esc(msg) + "</p>";
const record = (title, info, action = "") =>
    '<article class="record"><div><h3>' +
    esc(title) +
    "</h3><small>" +
    esc(info) +
    "</small></div>" +
    action +
    "</article>";
const status = (l) =>
    !l.returned
        ? "대여 중"
        : (l.deposit_received && !l.deposit_back) ||
        (l.card_received && !l.card_back)
            ? "반환 대기"
            : "반환 완료";
const unitsOf = (id) => data.units.filter((u) => u.item_id == id);
const titleOf = (id) => data.home.items.find((i) => i.id == id)?.title;
function overview() {
  const loans = data.loans,
      day = data.home.now.slice(0, 10);
  return (
      '<div class="metrics">' +
      metric("오늘 신청", data.todayRequests) +
      metric("신청 대기", data.requests.length) +
      metric("반환 대기", loans.filter((l) => status(l) === "반환 대기").length) +
      metric("현재 대여 중", loans.filter((l) => !l.returned).length) +
      metric("오늘 승인", loans.filter((l) => l.issued.startsWith(day)).length) +
      metric(
          "기한 경과",
          loans.filter((l) => !l.returned && l.due < data.home.now).length,
      ) +
      "</div><h2>최근 신청</h2>" +
      requestList(data.requests.slice(0, 5)) +
      weekSummary() +
      '<h2>업무 바로가기</h2><div class="chips">' +
      ["requests", "loans", "stock", "stats"]
          .map((k) => '<a class="btn" href="#' + k + '">' + pages[k] + "</a>")
          .join("") +
      "</div>"
  );
}
const matches = (r) =>
    [r.name, r.student_no, r.phone, r.title, r.codes, r.officer].some((v) =>
        String(v || "").includes(query),
    );
const requestList = (list) =>
    list
        .map((r) =>
            record(
                r.title + " · " + r.name,
                r.student_no + " · " + fmt(r.created),
                btn("신청 상세", "requestDetail(" + r.id + ")"),
            ),
        )
        .join("") || empty("대기 중인 신청이 없습니다.");
const search = () =>
    '<label>검색<input id="search" type="search" value="' +
    esc(query) +
    '" placeholder="이름, 학번, 물품 등"></label>';
function requestDetail(id) {
  let r = data.requests.find((r) => r.id === id);
  if (!r) return notice("이미 처리된 신청입니다.");
  let units = unitsOf(r.item_id).filter((u) => u.state === "AVAILABLE");
  popup(
      "<h2>신청 상세</h2>" +
      pair("물품", r.title) +
      pair("이름 · 학번", r.name + " · " + r.student_no) +
      pair("소속", r.faculty + " / " + r.department) +
      pair("전화번호", r.phone) +
      pair("신청 시각", fmt(r.created)) +
      '<form data-path="approve/' +
      id +
      '"><h3>배정할 고유번호</h3><div class="chips">' +
      (units
          .map(
              (u) =>
                  '<label class="check"><input type="checkbox" name="units" value="' +
                  u.id +
                  '">' +
                  esc(u.code) +
                  "</label>",
          )
          .join("") || empty("가용 재고가 없습니다.")) +
      "</div>" +
      select(
          "staff",
          "담당 임원",
          opt("", "담당자 선택") +
          data.staff.map((s) => opt(s.id, s.name)).join(""),
      ) +
      '<label>비고<textarea name="memo" maxlength="500" placeholder="예: 야구공 1개"></textarea></label>' +
      check("deposit", "현금 보증금 수령", false) +
      check("card", "실물 신분증 수령") +
      check("exception", "미제출 예외 승인") +
      '<label class="exception-reason" hidden>미제출 사유<input name="exceptionReason" maxlength="180"></label>' +
      '<p class="error" role="status" aria-live="polite" data-approval-feedback>' +
      esc(data.home.closed ? approvalHoursMessage(data.home.closed) : "") +
      '</p><button type="submit" class="primary wide">대여 승인</button></form>' +
      btn("신청 삭제", "cancelRequest(" + id + ")", "wide"),
  );
}
function approvalHoursMessage(reason) {
  const policy = data.home.policy;
  return reason + " · 운영 시간 " + policy.opens.slice(0, 5) + "–" + policy.closes.slice(0, 5) + "에 승인할 수 있습니다.";
}

function approvalFeedback(form, message) {
  const feedback = form.querySelector("[data-approval-feedback]");
  feedback.textContent = message;
  feedback.scrollIntoView({ block: "nearest" });
}

// Native constraint validation runs before submit, including when the dialog is scrolled.
document.addEventListener("invalid", (event) => {
  const control = event.target;
  const form = control.closest('form[data-path^="approve/"]');
  if (!form || form.querySelector(":invalid") !== control) return;
  const messages = {
    staff: "담당 임원을 선택해 주세요.",
    deposit: "현금 보증금 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    card: "실물 신분증 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    exceptionReason: "미제출 사유를 입력해 주세요.",
  };
  approvalFeedback(form, messages[control.name] || control.validationMessage);
}, true);

document.addEventListener("change", (e) => {
  const f = e.target.closest('form[data-path^="approve/"]');
  if (!f) return;
  const exception = f.elements.exception.checked;
  f.elements.deposit.required = f.elements.card.required = !exception;
  f.querySelector(".exception-reason").hidden = !exception;
  f.elements.exceptionReason.required =
      exception && (!f.elements.deposit.checked || !f.elements.card.checked);
});
function cancelRequest(id) {
  if (confirm("이 대기 신청을 삭제할까요?")) mutate("action/cancel", { id });
}
function loanList() {
  const list = data.loans.filter(
      (l) =>
          matches(l) &&
          (!filter ||
              status(l) === filter ||
              (filter === "지각" && l.late) ||
              (filter === "기한 경과" && !l.returned && l.due < data.home.now)),
  );
  return (
      search() +
      '<fieldset class="status-filter"><legend>처리 상태</legend><div>' +
      ["","대여 중","기한 경과","지각","반환 대기","반환 완료"].map(value=>
          '<label><input type="radio" name="status" value="'+value+'" '+(filter===value?'checked':'')+'><span>'+(value||"전체")+'</span></label>'
      ).join("")+'</div></fieldset>' +
      list
          .map((l) =>
              record(
                  l.title + " · " + l.name,
                  status(l) + " · " + l.codes + " · 반납 기한 " + fmt(l.due),
                  btn("상세 보기", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") +
      (list.length ? "" : empty("표시할 대여 기록이 없습니다."))
  );
}
function loanDetail(id) {
  let l = data.loans.find((l) => l.id === id);
  let body =
      "<h2>대여 #" +
      id +
      "</h2>" +
      pair("상태", status(l)) +
      pair("물품", l.title) +
      pair("고유번호", l.codes) +
      pair("학생", l.name + " · " + l.student_no) +
      pair("전화번호", l.phone) +
      pair("담당 임원", l.officer) +
      pair("비고", l.memo || "—") +
      pair("보증금 수령", l.deposit_received ? "수령" : "미제출") +
      pair("실물 신분증 수령", l.card_received ? "수령" : "미제출") +
      (l.exception_reason ? pair("미제출 사유", l.exception_reason) : "") +
      pair("승인 시각", fmt(l.issued)) +
      pair("반납 기한", fmt(l.due));
  if (l.returned)
    body +=
        pair("실제 반납", fmt(l.returned)) +
        pair("판정", l.late ? "지각" : "정상") +
        pair(
            "보증금 반환",
            !l.deposit_received ? "해당 없음" : l.deposit_back ? "완료" : "미반환",
        ) +
        pair(
            "신분증 반환",
            !l.card_received ? "해당 없음" : l.card_back ? "완료" : "미반환",
        );
  if (status(l) !== "반환 완료")
    body +=
        '<form data-path="' +
        (l.returned ? "action/settle" : "return/" + id) +
        '"><input type="hidden" name="id" value="' +
        id +
        '">' +
        (l.deposit_received
            ? check("deposit", "보증금 반환 완료", l.deposit_back, true)
            : "") +
        (l.card_received
            ? check("card", "신분증 반환 완료", l.card_back, true)
            : "") +
        '<button class="primary wide">' +
        (l.returned ? "반환 확인 저장" : "선택한 대여 건 전체 반납") +
        "</button></form>";
  if (l.returned)
    body +=
        '<details><summary>지각 기록 정정</summary><form data-path="action/correct"><input type="hidden" name="id" value="' +
        id +
        '">' +
        check("late", "지각으로 기록", l.late) +
        field("reason", "정정 사유", "", "text", 'required maxlength="180"') +
        "<button>정정 저장</button></form></details>";
  popup(body);
}
function weekSummary() {
  const day = data.home.now.slice(0, 10),
      daily = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - back);
    const key = date.toISOString().slice(0, 10);
    daily.push([
      key,
      data.loans.filter((l) => l.issued.startsWith(key)).length,
    ]);
  }
  const recent = data.loans.filter((l) => l.issued.slice(0, 10) >= daily[0][0]);
  const items = data.home.items
      .map((i) => [i.title, recent.filter((l) => l.item_id === i.id).length])
      .sort((a, b) => b[1] - a[1]);
  return (
      '<section class="panel week-report"><h2>최근 7일 대여 현황</h2>' +
      pair(
          "최다 대여 물품",
          recent.length
              ? items[0][0] + " · " + items[0][1] + "건"
              : "대여 기록 없음",
      ) +
      '<div class="week">' +
      daily
          .map(
              ([d, n]) =>
                  "<div><strong>" +
                  n +
                  "</strong><small>" +
                  d.slice(5) +
                  "</small></div>",
          )
          .join("") +
      "</div><details><summary>물품별 승인 건수</summary>" +
      items.map(([k, v]) => pair(k, v + "건")).join("") +
      "</details></section>"
  );
}
function historyOfUnit(id) {
  const u = data.units.find((u) => u.id === id);
  let loans = data.loans.filter((l) => l.codes.split(", ").includes(u.code));
  popup(
      "<h2>" +
      esc(u.code) +
      " 대여 이력</h2>" +
      (loans
          .map((l) =>
              record(
                  l.name,
                  fmt(l.issued) + " · " + status(l),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("대여 이력이 없습니다.")),
  );
}
function itemEditor(id = 0) {
  const item = data.home.items.find((i) => i.id === id);
  popup(
      "<h2>" +
      (item ? "물품 수정" : "새 물품 등록") +
      '</h2><form data-path="catalog"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "title",
          "물품 이름",
          item?.title || "",
          "text",
          'required maxlength="80"',
      ) +
      field(
          "quantity",
          item ? "추가할 수량" : "초기 수량",
          item ? 0 : 1,
          "number",
          'required min="' + (item ? 0 : 1) + '" max="500"',
      ) +
      select(
          "nextDay",
          "반납 기준",
          opt("false", "대여 당일", !item?.next_day) +
          opt("true", "대여 다음 날", item?.next_day),
      ) +
      '<label>물품 사진 · JPG 또는 PNG, 최대 5MB<input type="file" name="photo" accept="image/png,image/jpeg"></label><button class="primary wide">저장</button></form>'+ (item?btn("이 물품 삭제","deleteItem("+id+")","wide"):""),
  );
}
function deleteItem(id){
  if(confirm(titleOf(id)+"을 대여 목록에서 삭제할까요? 기존 대여 기록은 보존됩니다."))mutate("action/delete-item",{id});
}
function stock() {
  return (
      btn("새 물품 등록", "itemEditor()", "primary") +
      '<div class="catalog-list">' +
      data.home.items
          .map((i) =>
              record(
                  i.title,
                  "전체 " +
                  i.total +
                  "개 · 대여 가능 " +
                  i.available +
                  "개 · 대여 중 " +
                  i.rented +
                  "개 · 사용 불가 " +
                  (i.total - i.available - i.rented) +
                  "개",
                  '<div class="row-actions">'+btn("물품 수정", "itemEditor(" + i.id + ")") +
                  btn("고유번호 관리", "stockDetail(" + i.id + ")")+"</div>",
              ),
          )
          .join("") +
      "</div>"
  );
}
function stockDetail(id) {
  let labels = {
    AVAILABLE: "대여 가능",
    OUT: "대여 중",
    DISABLED: "사용 불가",
  };
  popup(
      "<h2>" +
      esc(titleOf(id)) +
      "</h2>" +
      unitsOf(id)
          .map((u) =>
              record(
                  u.code,
                  labels[u.state],
                  '<div class="unit-actions">' +
                  btn("이력", "historyOfUnit(" + u.id + ")") +
                  (u.state === "OUT"
                      ? ""
                      : '<div class="chips">' +
                      btn(
                          u.state === "DISABLED" ? "복구" : "사용 불가",
                          "unitAction(" + u.id + ",false)",
                      ) +
                      btn("삭제", "unitAction(" + u.id + ",true)") +
                      "</div>") +
                  "</div>",
              ),
          )
          .join("") +
      '<form data-path="action/add-unit"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field("code", "새 고유번호", "", "text", 'maxlength="32" required') +
      '<button class="primary wide">고유번호 등록</button></form>',
  );
}
function unitAction(id, remove) {
  if (!remove || confirm("고유번호를 삭제할까요?"))
    mutate("action/" + (remove ? "remove-unit" : "unit"), { id });
}
function people() {
  let list = data.borrowers.filter(matches);
  return (
      search() +
      list
          .map((b) =>
              record(
                  b.name + " · " + b.student_no,
                  "누적 지각 " +
                  b.late_count +
                  "회 · " +
                  (b.suspended ? "정지" : "신청 가능"),
                  btn(
                      "관리",
                      "person(" + JSON.stringify(b.student_no).replaceAll('"', "'") + ")",
                  ),
              ),
          )
          .join("") +
      (list.length ? "" : empty("학생 기록이 없습니다."))
  );
}
async function person(no) {
  const b = data.borrowers.find((b) => b.student_no === no);
  let history;
  try {
    history = await api("admin/borrowers/" + no + "/history");
  } catch (e) {
    report(e);
    return;
  }
  popup(
      "<h2>" +
      esc(b.name) +
      " · 대여 제한</h2>" +
      pair("누적 지각", b.late_count + "회") +
      '<form data-path="action/restriction"><input type="hidden" name="id" value="0"><input type="hidden" name="studentNo" value="' +
      no +
      '">' +
      check("suspend", "대여 제한 적용", b.suspended) +
      field("reason", "처리 사유", "", "text", 'required maxlength="180"') +
      '<button class="primary wide">상태 저장</button></form><h3>처리 사유와 이력</h3>' +
      (history
          .map((e) => record(e.detail, fmt(e.happened) + " · " + e.actor))
          .join("") || empty("처리 이력이 없습니다.")) +
      "<h3>지각 대여 기록</h3>" +
      (data.loans
          .filter((l) => l.student_no === no && l.late)
          .map((l) =>
              record(
                  l.title,
                  fmt(l.returned),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("지각 이력이 없습니다.")),
  );
}
function settings() {
  const p = data.home.policy;
  return (
      '<section class="panel"><h2>정기 운영</h2><form data-path="action/policy"><div class="chips">' +
      [..."월화수목금토일"]
          .map(
              (s, i) =>
                  '<label class="check"><input type="checkbox" name="days" value="' +
                  (i + 1) +
                  '" ' +
                  (p.weekdays.includes(i + 1) ? "checked" : "") +
                  ">" +
                  s +
                  "</label>",
          )
          .join("") +
      '</div><div class="formgrid">' +
      field("opens", "시작 시각", p.opens, "time", "required") +
      field("closes", "종료 시각", p.closes, "time", "required") +
      "</div>" +
      '<button class="primary">운영 설정 저장</button></form></section><section class="panel"><h2>대여 중단 기간</h2>' +
      data.home.closures
          .map((c) =>
              record(
                  c.reason,
                  c.starts + " ~ " + c.ends,
                  btn("기간 삭제", "removeClosure(" + c.id + ")"),
              ),
          )
          .join("") +
      '<form data-path="action/closure"><div class="formgrid">' +
      field("starts", "시작일", "", "date", "required") +
      field("ends", "종료일", "", "date", "required") +
      "</div>" +
      field("reason", "중단 사유", "", "text", 'required maxlength="180"') +
      "<button>중단 기간 등록</button></form></section>"
  );
}
function removeClosure(id) {
  if (confirm("중단 기간을 삭제할까요?")) mutate("action/end-closure", { id });
}
function officer(id) {
  const s = data.staff.find((s) => s.id === id);
  popup(
      '<h2>임원 연락처 수정</h2><form data-path="action/staff"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "name",
          "당직표에 쓰인 이름",
          s.name,
          "text",
          'required maxlength="50"',
      ) +
      field(
          "phone",
          "전화 연결 번호",
          s.phone,
          "tel",
          'placeholder="010-0000-0000"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function account(id) {
  popup(
      "<h2>임원 로그인 설정</h2>" +
      pair("개인 아이디", "staff" + id) +
      '<form data-path="action/password"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "password",
          "새 비밀번호",
          "",
          "password",
          'required minlength="8" autocomplete="new-password"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function statistics() {
  return (
      '<div class="panel"><div class="formgrid">' +
      field("start", "시작일", start, "date") +
      field("end", "종료일", end, "date") +
      select(
          "itemFilter",
          "물품",
          opt("", "전체") +
          data.home.items
              .map((i) => opt(i.id, i.title, i.id == itemFilter))
              .join(""),
      ) +
      select(
          "period",
          "집계 단위",
          [
            ["day", "일별"],
            ["week", "주별"],
            ["month", "월별"],
          ]
              .map(([k, v]) => opt(k, v, k === period))
              .join(""),
      ) +
      '</div></div><div id="figures"></div>'
  );
}
function plot() {
  charts.forEach((c) => c.destroy());
  charts = [];
  const list = data.loans.filter(
      (l) =>
          (!itemFilter || l.item_id == itemFilter) &&
          (!start || l.issued.slice(0, 10) >= start) &&
          (!end || l.issued.slice(0, 10) <= end),
  );
  const done = list.filter((l) => l.returned),
      late = done.filter((l) => l.late).length;
  const minute = (v) => Date.parse(v + "+09:00") / 60000;
  const avg = done.length
      ? Math.round(
          done.reduce(
              (sum, l) => sum + minute(l.returned) - minute(l.issued),
              0,
          ) / done.length,
      )
      : 0;
  const counts = (key, initial = {}) =>
      list.reduce((m, l) => {
        const k = key(l);
        m[k] = (m[k] || 0) + 1;
        return m;
      }, initial);
  const trend = counts((l) => {
    let day = l.issued.slice(0, 10);
    if (period === "month") return day.slice(0, 7);
    if (period === "week") {
      const d = new Date(day + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    }
    return day;
  });
  const ordered = Object.fromEntries(
      Object.entries(trend).sort(([a], [b]) => a.localeCompare(b)),
  );
  const byItem = counts(
      (l) => l.title,
      Object.fromEntries(data.home.items.map((i) => [i.title, 0])),
  );
  const weekdays = counts(
      (l) =>
          "일월화수목금토"[
              new Date(l.issued.slice(0, 10) + "T00:00:00Z").getUTCDay()
              ],
      Object.fromEntries([..."월화수목금토일"].map((v) => [v, 0])),
  );
  const blocks = [
    "00–06시",
    "06–09시",
    "09–12시",
    "12–15시",
    "15–18시",
    "18–24시",
  ];
  const times = counts(
      (l) =>
          blocks[
              [6, 9, 12, 15, 18, 24].findIndex(
                  (end) => Number(l.issued.slice(11, 13)) < end,
              )
              ],
      Object.fromEntries(blocks.map((b) => [b, 0])),
  );
  const palette = [
    "#2e3955",
    "#638287",
    "#829aba",
    "#8d7787",
    "#bac8aa",
    "#9faad0",
    "#b99577",
    "#718c69",
  ];
  const legend = Object.keys(byItem)
      .map(
          (name, i) =>
              '<li><i style="background:' +
              palette[i % palette.length] +
              '"></i>' +
              esc(name) +
              "</li>",
      )
      .join("");
  const graphs = [
    ["대여 추이", "line", ordered],
    ["물품별 대여 횟수", "bar", byItem],
    ["물품별 이용 비율", "doughnut", byItem],
    ["요일별 이용", "bar", weekdays],
    ["시간대별 이용", "bar", times],
  ];
  $("#figures").innerHTML =
      '<div class="metrics">' +
      metric("승인 건수", list.length) +
      metric("평균 이용 시간", avg + "분") +
      metric("미반납", list.length - done.length) +
      metric("반환 대기", done.filter((l) => status(l) === "반환 대기").length) +
      "</div>" +
      pair(
          "지각 건수 / 반납 대비 비율",
          late +
          "건 / " +
          (done.length ? ((100 * late) / done.length).toFixed(1) : 0) +
          "%",
      ) +
      '<div class="charts">' +
      graphs
          .map(
              ([name, type, series], i) =>
                  '<section class="card"><h3>' +
                  name +
                  '</h3><div class="plot-area"><canvas id="graph' +
                  i +
                  '" aria-label="' +
                  name +
                  '"></canvas></div>' +
                  (type === "doughnut"
                      ? '<ul class="plot-key">' + legend + "</ul>"
                      : "") +
                  "<details><summary>수치 보기</summary>" +
                  Object.entries(series)
                      .map(([k, v]) => pair(k, v + "건"))
                      .join("") +
                  "</details></section>",
          )
          .join("") +
      "</div>";
  if (window.Chart) Chart.defaults.font.family = "Pretendard, sans-serif";
  if (window.Chart)
    graphs.forEach(([name, type, series], i) =>
        charts.push(
            new Chart($("#graph" + i), {
              type,
              data: {
                labels: Object.keys(series),
                datasets: [
                  {
                    label: name,
                    data: Object.values(series),
                    borderColor: "#536986",
                    backgroundColor:
                        type === "doughnut"
                            ? [
                              "#2e3955",
                              "#638287",
                              "#829aba",
                              "#8d7787",
                              "#bac8aa",
                              "#9faad0",
                              "#b99577",
                              "#718c69",
                            ]
                            : "#7088a9",
                  },
                ],
              },
              options: {
                animation: false,
                maintainAspectRatio: false,
                indexAxis: i === 1 ? "y" : "x",
                scales:
                    type === "doughnut"
                        ? {}
                        : {
                          x: {
                            ticks: {
                              maxRotation: 0,
                              minRotation: 0,
                              autoSkip: true,
                              maxTicksLimit: 8,
                            },
                          },
                          y: { ticks: { precision: 0 } },
                        },
                plugins: { legend: { display: false } },
              },
            }),
        ),
    );
}
function render() {
  if (!data) return;
  charts.forEach((c) => c.destroy());
  charts = [];
  const p = page();
  $("#tabs").innerHTML = Object.entries(pages)
      .map(
          ([k, v]) =>
              '<a href="#' +
              k +
              '" class="' +
              (k === p ? "on" : "") +
              '">' +
              v +
              "</a>",
      )
      .join("");
  let content = {
    overview,
    requests: () => search() + requestList(data.requests.filter(matches)),
    loans: loanList,
    stock,
    people,
    settings,
    stats: statistics,
    staff: () =>
        "<p>월별 당직표의 이름과 일치하는 임원에게 연결됩니다. 전화번호를 등록하면 학생 화면의 전화 버튼이 활성화됩니다. 대표 관리자는 개인 로그인도 설정할 수 있습니다.</p>" +
        data.staff
            .map((s) =>
                record(
                    s.name,
                    s.phone || "번호 미등록",
                    '<div class="staff-actions row-actions">'+btn("수정", "officer(" + s.id + ")") +
                    ($("aside").dataset.master === "true"
                        ? btn("계정 설정", "account(" + s.id + ")")
                        : "")+"</div>",
                ),
            )
            .join(""),
    audit: () =>
        data.audit
            .map((a) => record(a.detail, fmt(a.happened) + " · " + a.actor))
            .join("") || empty("아직 기록된 작업이 없습니다."),
  }[p]();
  app.innerHTML =
      '<div class="sectiontitle"><h1>' +
      pages[p] +
      "</h1><small>" +
      fmt(data.home.now) +
      " 기준</small></div>" +
      content;
  if ($("#search"))
    $("#search").oninput = (e) => {
      query = e.target.value;
      render();
      $("#search").focus();
    };
  app.querySelectorAll('.status-filter input').forEach(input=>{
    input.onchange=()=>{
      filter=input.value;
      render();
      app.querySelector('.status-filter input:checked').focus({preventScroll:true});
    };
  });
  if (p === "stats") {
    plot();
    for (const name of ["start", "end", "itemFilter", "period"])
      app.querySelector("[name=" + name + "]").onchange = (e) => {
        const v = e.target.value;
        if (name === "start") start = v;
        if (name === "end") end = v;
        if (name === "itemFilter") itemFilter = v;
        if (name === "period") period = v;
        plot();
      };
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await api("admin/desk");
    render();
  } catch (e) {
    report(e);
  } finally {
    loading = false;
  }
}
async function mutate(path, form) {
  if (busy) return;
  busy = true;
  try {
    await api("admin/" + path, form);
    if (modal.open) modal.close();
    await refresh();
    notice("저장했습니다.");
  } catch (e) {
    report(e);
  } finally {
    busy = false;
  }
}
async function approveRequest(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!form.querySelector('[name="units"]:checked')) {
    approvalFeedback(form, "배정할 고유번호를 하나 이상 선택해 주세요.");
    return;
  }
  button.disabled = true;
  button.textContent = "승인 중…";
  try {
    await api("admin/" + form.dataset.path, new FormData(form));
    if (form.isConnected && modal.open) modal.close();
    await refresh();
    notice("대여를 승인했습니다.");
  } catch (error) {
    if (form.isConnected) approvalFeedback(form, error.message === "운영 시간 외" ? approvalHoursMessage(error.message) : error.message);
  } finally {
    button.disabled = false;
    button.textContent = "대여 승인";
  }
}

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-path]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.path.startsWith("approve/")) {
    approveRequest(form);
    return;
  }
  mutate(form.dataset.path, new FormData(form));
});
window.addEventListener("hashchange", () => {
  query = "";
  filter = "";
  window.scrollTo(0, 0);
  render();
  refresh();
});
refresh();
setInterval(() => {
  if (
      !document.hidden &&
      !modal.open &&
      !busy &&
      ["overview", "requests", "loans"].includes(page()) &&
      !["INPUT", "SELECT"].includes(document.activeElement.tagName)
  )
    refresh();
}, 3000);
"use strict";
const pages = {
  overview: "대시보드",
  requests: "신청 목록",
  loans: "대여·반납",
  stock: "물품·고유번호",
  people: "지각·대여 제한",
  stats: "이용 통계",
  settings: "운영 설정",
  staff: "임원 연락처",
  audit: "작업 이력",
};
const page = () =>
    Object.hasOwn(pages, location.hash.slice(1))
        ? location.hash.slice(1)
        : "overview";
let data,
    query = "",
    filter = "",
    itemFilter = "",
    start = "",
    end = "",
    period = "day",
    charts = [],
    busy = false,
    loading = false;
const metric = (title, value) =>
    '<div class="card metric"><small>' +
    esc(title) +
    "</small><strong>" +
    esc(value) +
    "</strong></div>";
const empty = (msg) => '<p class="empty">' + esc(msg) + "</p>";
const record = (title, info, action = "") =>
    '<article class="record"><div><h3>' +
    esc(title) +
    "</h3><small>" +
    esc(info) +
    "</small></div>" +
    action +
    "</article>";
const status = (l) =>
    !l.returned
        ? "대여 중"
        : (l.deposit_received && !l.deposit_back) ||
        (l.card_received && !l.card_back)
            ? "반환 대기"
            : "반환 완료";
const unitsOf = (id) => data.units.filter((u) => u.item_id == id);
const titleOf = (id) => data.home.items.find((i) => i.id == id)?.title;
function overview() {
  const loans = data.loans,
      day = data.home.now.slice(0, 10);
  return (
      '<div class="metrics">' +
      metric("오늘 신청", data.todayRequests) +
      metric("신청 대기", data.requests.length) +
      metric("반환 대기", loans.filter((l) => status(l) === "반환 대기").length) +
      metric("현재 대여 중", loans.filter((l) => !l.returned).length) +
      metric("오늘 승인", loans.filter((l) => l.issued.startsWith(day)).length) +
      metric(
          "기한 경과",
          loans.filter((l) => !l.returned && l.due < data.home.now).length,
      ) +
      "</div><h2>최근 신청</h2>" +
      requestList(data.requests.slice(0, 5)) +
      weekSummary() +
      '<h2>업무 바로가기</h2><div class="chips">' +
      ["requests", "loans", "stock", "stats"]
          .map((k) => '<a class="btn" href="#' + k + '">' + pages[k] + "</a>")
          .join("") +
      "</div>"
  );
}
const matches = (r) =>
    [r.name, r.student_no, r.phone, r.title, r.codes, r.officer].some((v) =>
        String(v || "").includes(query),
    );
const requestList = (list) =>
    list
        .map((r) =>
            record(
                r.title + " · " + r.name,
                r.student_no + " · " + fmt(r.created),
                btn("신청 상세", "requestDetail(" + r.id + ")"),
            ),
        )
        .join("") || empty("대기 중인 신청이 없습니다.");
const search = () =>
    '<label>검색<input id="search" type="search" value="' +
    esc(query) +
    '" placeholder="이름, 학번, 물품 등"></label>';
function requestDetail(id) {
  let r = data.requests.find((r) => r.id === id);
  if (!r) return notice("이미 처리된 신청입니다.");
  let units = unitsOf(r.item_id).filter((u) => u.state === "AVAILABLE");
  popup(
      "<h2>신청 상세</h2>" +
      pair("물품", r.title) +
      pair("이름 · 학번", r.name + " · " + r.student_no) +
      pair("소속", r.faculty + " / " + r.department) +
      pair("전화번호", r.phone) +
      pair("신청 시각", fmt(r.created)) +
      '<form data-path="approve/' +
      id +
      '"><h3>배정할 고유번호</h3><div class="chips">' +
      (units
          .map(
              (u) =>
                  '<label class="check"><input type="checkbox" name="units" value="' +
                  u.id +
                  '">' +
                  esc(u.code) +
                  "</label>",
          )
          .join("") || empty("가용 재고가 없습니다.")) +
      "</div>" +
      select(
          "staff",
          "담당 임원",
          opt("", "담당자 선택") +
          data.staff.map((s) => opt(s.id, s.name)).join(""),
      ) +
      '<label>비고<textarea name="memo" maxlength="500" placeholder="예: 야구공 1개"></textarea></label>' +
      check("deposit", "현금 보증금 수령", false) +
      check("card", "실물 신분증 수령") +
      check("exception", "미제출 예외 승인") +
      '<label class="exception-reason" hidden>미제출 사유<input name="exceptionReason" maxlength="180"></label>' +
      '<p class="error" role="status" aria-live="polite" data-approval-feedback>' +
      esc(data.home.closed ? approvalHoursMessage(data.home.closed) : "") +
      '</p><button type="submit" class="primary wide">대여 승인</button></form>' +
      btn("신청 삭제", "cancelRequest(" + id + ")", "wide"),
  );
}
function approvalHoursMessage(reason) {
  const policy = data.home.policy;
  return reason + " · 운영 시간 " + policy.opens.slice(0, 5) + "–" + policy.closes.slice(0, 5) + "에 승인할 수 있습니다.";
}

function approvalFeedback(form, message) {
  const feedback = form.querySelector("[data-approval-feedback]");
  feedback.textContent = message;
  feedback.scrollIntoView({ block: "nearest" });
}

// Native constraint validation runs before submit, including when the dialog is scrolled.
document.addEventListener("invalid", (event) => {
  const control = event.target;
  const form = control.closest('form[data-path^="approve/"]');
  if (!form || form.querySelector(":invalid") !== control) return;
  const messages = {
    staff: "담당 임원을 선택해 주세요.",
    deposit: "현금 보증금 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    card: "실물 신분증 수령을 확인하거나 미제출 예외 승인을 선택해 주세요.",
    exceptionReason: "미제출 사유를 입력해 주세요.",
  };
  approvalFeedback(form, messages[control.name] || control.validationMessage);
}, true);

document.addEventListener("change", (e) => {
  const f = e.target.closest('form[data-path^="approve/"]');
  if (!f) return;
  const exception = f.elements.exception.checked;
  f.elements.deposit.required = f.elements.card.required = !exception;
  f.querySelector(".exception-reason").hidden = !exception;
  f.elements.exceptionReason.required =
      exception && (!f.elements.deposit.checked || !f.elements.card.checked);
});
function cancelRequest(id) {
  if (confirm("이 대기 신청을 삭제할까요?")) mutate("action/cancel", { id });
}
function loanList() {
  const list = data.loans.filter(
      (l) =>
          matches(l) &&
          (!filter ||
              status(l) === filter ||
              (filter === "지각" && l.late) ||
              (filter === "기한 경과" && !l.returned && l.due < data.home.now)),
  );
  return (
      search() +
      '<fieldset class="status-filter"><legend>처리 상태</legend><div>' +
      ["","대여 중","기한 경과","지각","반환 대기","반환 완료"].map(value=>
          '<label><input type="radio" name="status" value="'+value+'" '+(filter===value?'checked':'')+'><span>'+(value||"전체")+'</span></label>'
      ).join("")+'</div></fieldset>' +
      list
          .map((l) =>
              record(
                  l.title + " · " + l.name,
                  status(l) + " · " + l.codes + " · 반납 기한 " + fmt(l.due),
                  btn("상세 보기", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") +
      (list.length ? "" : empty("표시할 대여 기록이 없습니다."))
  );
}
function loanDetail(id) {
  let l = data.loans.find((l) => l.id === id);
  let body =
      "<h2>대여 #" +
      id +
      "</h2>" +
      pair("상태", status(l)) +
      pair("물품", l.title) +
      pair("고유번호", l.codes) +
      pair("학생", l.name + " · " + l.student_no) +
      pair("전화번호", l.phone) +
      pair("담당 임원", l.officer) +
      pair("비고", l.memo || "—") +
      pair("보증금 수령", l.deposit_received ? "수령" : "미제출") +
      pair("실물 신분증 수령", l.card_received ? "수령" : "미제출") +
      (l.exception_reason ? pair("미제출 사유", l.exception_reason) : "") +
      pair("승인 시각", fmt(l.issued)) +
      pair("반납 기한", fmt(l.due));
  if (l.returned)
    body +=
        pair("실제 반납", fmt(l.returned)) +
        pair("판정", l.late ? "지각" : "정상") +
        pair(
            "보증금 반환",
            !l.deposit_received ? "해당 없음" : l.deposit_back ? "완료" : "미반환",
        ) +
        pair(
            "신분증 반환",
            !l.card_received ? "해당 없음" : l.card_back ? "완료" : "미반환",
        );
  if (status(l) !== "반환 완료")
    body +=
        '<form data-path="' +
        (l.returned ? "action/settle" : "return/" + id) +
        '"><input type="hidden" name="id" value="' +
        id +
        '">' +
        (l.deposit_received
            ? check("deposit", "보증금 반환 완료", l.deposit_back, true)
            : "") +
        (l.card_received
            ? check("card", "신분증 반환 완료", l.card_back, true)
            : "") +
        '<button class="primary wide">' +
        (l.returned ? "반환 확인 저장" : "선택한 대여 건 전체 반납") +
        "</button></form>";
  if (l.returned)
    body +=
        '<details><summary>지각 기록 정정</summary><form data-path="action/correct"><input type="hidden" name="id" value="' +
        id +
        '">' +
        check("late", "지각으로 기록", l.late) +
        field("reason", "정정 사유", "", "text", 'required maxlength="180"') +
        "<button>정정 저장</button></form></details>";
  popup(body);
}
function weekSummary() {
  const day = data.home.now.slice(0, 10),
      daily = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - back);
    const key = date.toISOString().slice(0, 10);
    daily.push([
      key,
      data.loans.filter((l) => l.issued.startsWith(key)).length,
    ]);
  }
  const recent = data.loans.filter((l) => l.issued.slice(0, 10) >= daily[0][0]);
  const items = data.home.items
      .map((i) => [i.title, recent.filter((l) => l.item_id === i.id).length])
      .sort((a, b) => b[1] - a[1]);
  return (
      '<section class="panel week-report"><h2>최근 7일 대여 현황</h2>' +
      pair(
          "최다 대여 물품",
          recent.length
              ? items[0][0] + " · " + items[0][1] + "건"
              : "대여 기록 없음",
      ) +
      '<div class="week">' +
      daily
          .map(
              ([d, n]) =>
                  "<div><strong>" +
                  n +
                  "</strong><small>" +
                  d.slice(5) +
                  "</small></div>",
          )
          .join("") +
      "</div><details><summary>물품별 승인 건수</summary>" +
      items.map(([k, v]) => pair(k, v + "건")).join("") +
      "</details></section>"
  );
}
function historyOfUnit(id) {
  const u = data.units.find((u) => u.id === id);
  let loans = data.loans.filter((l) => l.codes.split(", ").includes(u.code));
  popup(
      "<h2>" +
      esc(u.code) +
      " 대여 이력</h2>" +
      (loans
          .map((l) =>
              record(
                  l.name,
                  fmt(l.issued) + " · " + status(l),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("대여 이력이 없습니다.")),
  );
}
function itemEditor(id = 0) {
  const item = data.home.items.find((i) => i.id === id);
  popup(
      "<h2>" +
      (item ? "물품 수정" : "새 물품 등록") +
      '</h2><form data-path="catalog"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "title",
          "물품 이름",
          item?.title || "",
          "text",
          'required maxlength="80"',
      ) +
      field(
          "quantity",
          item ? "추가할 수량" : "초기 수량",
          item ? 0 : 1,
          "number",
          'required min="' + (item ? 0 : 1) + '" max="500"',
      ) +
      select(
          "nextDay",
          "반납 기준",
          opt("false", "대여 당일", !item?.next_day) +
          opt("true", "대여 다음 날", item?.next_day),
      ) +
      '<label>물품 사진 · JPG 또는 PNG, 최대 5MB<input type="file" name="photo" accept="image/png,image/jpeg"></label><button class="primary wide">저장</button></form>'+ (item?btn("이 물품 삭제","deleteItem("+id+")","wide"):""),
  );
}
function deleteItem(id){
  if(confirm(titleOf(id)+"을 대여 목록에서 삭제할까요? 기존 대여 기록은 보존됩니다."))mutate("action/delete-item",{id});
}
function stock() {
  return (
      btn("새 물품 등록", "itemEditor()", "primary") +
      '<div class="catalog-list">' +
      data.home.items
          .map((i) =>
              record(
                  i.title,
                  "전체 " +
                  i.total +
                  "개 · 대여 가능 " +
                  i.available +
                  "개 · 대여 중 " +
                  i.rented +
                  "개 · 사용 불가 " +
                  (i.total - i.available - i.rented) +
                  "개",
                  '<div class="row-actions">'+btn("물품 수정", "itemEditor(" + i.id + ")") +
                  btn("고유번호 관리", "stockDetail(" + i.id + ")")+"</div>",
              ),
          )
          .join("") +
      "</div>"
  );
}
function stockDetail(id) {
  let labels = {
    AVAILABLE: "대여 가능",
    OUT: "대여 중",
    DISABLED: "사용 불가",
  };
  popup(
      "<h2>" +
      esc(titleOf(id)) +
      "</h2>" +
      unitsOf(id)
          .map((u) =>
              record(
                  u.code,
                  labels[u.state],
                  '<div class="unit-actions">' +
                  btn("이력", "historyOfUnit(" + u.id + ")") +
                  (u.state === "OUT"
                      ? ""
                      : '<div class="chips">' +
                      btn(
                          u.state === "DISABLED" ? "복구" : "사용 불가",
                          "unitAction(" + u.id + ",false)",
                      ) +
                      btn("삭제", "unitAction(" + u.id + ",true)") +
                      "</div>") +
                  "</div>",
              ),
          )
          .join("") +
      '<form data-path="action/add-unit"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field("code", "새 고유번호", "", "text", 'maxlength="32" required') +
      '<button class="primary wide">고유번호 등록</button></form>',
  );
}
function unitAction(id, remove) {
  if (!remove || confirm("고유번호를 삭제할까요?"))
    mutate("action/" + (remove ? "remove-unit" : "unit"), { id });
}
function people() {
  let list = data.borrowers.filter(matches);
  return (
      search() +
      list
          .map((b) =>
              record(
                  b.name + " · " + b.student_no,
                  "누적 지각 " +
                  b.late_count +
                  "회 · " +
                  (b.suspended ? "정지" : "신청 가능"),
                  btn(
                      "관리",
                      "person(" + JSON.stringify(b.student_no).replaceAll('"', "'") + ")",
                  ),
              ),
          )
          .join("") +
      (list.length ? "" : empty("학생 기록이 없습니다."))
  );
}
async function person(no) {
  const b = data.borrowers.find((b) => b.student_no === no);
  let history;
  try {
    history = await api("admin/borrowers/" + no + "/history");
  } catch (e) {
    report(e);
    return;
  }
  popup(
      "<h2>" +
      esc(b.name) +
      " · 대여 제한</h2>" +
      pair("누적 지각", b.late_count + "회") +
      '<form data-path="action/restriction"><input type="hidden" name="id" value="0"><input type="hidden" name="studentNo" value="' +
      no +
      '">' +
      check("suspend", "대여 제한 적용", b.suspended) +
      field("reason", "처리 사유", "", "text", 'required maxlength="180"') +
      '<button class="primary wide">상태 저장</button></form><h3>처리 사유와 이력</h3>' +
      (history
          .map((e) => record(e.detail, fmt(e.happened) + " · " + e.actor))
          .join("") || empty("처리 이력이 없습니다.")) +
      "<h3>지각 대여 기록</h3>" +
      (data.loans
          .filter((l) => l.student_no === no && l.late)
          .map((l) =>
              record(
                  l.title,
                  fmt(l.returned),
                  btn("상세", "loanDetail(" + l.id + ")"),
              ),
          )
          .join("") || empty("지각 이력이 없습니다.")),
  );
}
function settings() {
  const p = data.home.policy;
  return (
      '<section class="panel"><h2>정기 운영</h2><form data-path="action/policy"><div class="chips">' +
      [..."월화수목금토일"]
          .map(
              (s, i) =>
                  '<label class="check"><input type="checkbox" name="days" value="' +
                  (i + 1) +
                  '" ' +
                  (p.weekdays.includes(i + 1) ? "checked" : "") +
                  ">" +
                  s +
                  "</label>",
          )
          .join("") +
      '</div><div class="formgrid">' +
      field("opens", "시작 시각", p.opens, "time", "required") +
      field("closes", "종료 시각", p.closes, "time", "required") +
      "</div>" +
      '<button class="primary">운영 설정 저장</button></form></section><section class="panel"><h2>대여 중단 기간</h2>' +
      data.home.closures
          .map((c) =>
              record(
                  c.reason,
                  c.starts + " ~ " + c.ends,
                  btn("기간 삭제", "removeClosure(" + c.id + ")"),
              ),
          )
          .join("") +
      '<form data-path="action/closure"><div class="formgrid">' +
      field("starts", "시작일", "", "date", "required") +
      field("ends", "종료일", "", "date", "required") +
      "</div>" +
      field("reason", "중단 사유", "", "text", 'required maxlength="180"') +
      "<button>중단 기간 등록</button></form></section>"
  );
}
function removeClosure(id) {
  if (confirm("중단 기간을 삭제할까요?")) mutate("action/end-closure", { id });
}
function officer(id) {
  const s = data.staff.find((s) => s.id === id);
  popup(
      '<h2>임원 연락처 수정</h2><form data-path="action/staff"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "name",
          "당직표에 쓰인 이름",
          s.name,
          "text",
          'required maxlength="50"',
      ) +
      field(
          "phone",
          "전화 연결 번호",
          s.phone,
          "tel",
          'placeholder="010-0000-0000"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function account(id) {
  popup(
      "<h2>임원 로그인 설정</h2>" +
      pair("개인 아이디", "staff" + id) +
      '<form data-path="action/password"><input type="hidden" name="id" value="' +
      id +
      '">' +
      field(
          "password",
          "새 비밀번호",
          "",
          "password",
          'required minlength="8" autocomplete="new-password"',
      ) +
      '<button class="primary wide">저장</button></form>',
  );
}
function statistics() {
  return (
      '<div class="panel"><div class="formgrid">' +
      field("start", "시작일", start, "date") +
      field("end", "종료일", end, "date") +
      select(
          "itemFilter",
          "물품",
          opt("", "전체") +
          data.home.items
              .map((i) => opt(i.id, i.title, i.id == itemFilter))
              .join(""),
      ) +
      select(
          "period",
          "집계 단위",
          [
            ["day", "일별"],
            ["week", "주별"],
            ["month", "월별"],
          ]
              .map(([k, v]) => opt(k, v, k === period))
              .join(""),
      ) +
      '</div></div><div id="figures"></div>'
  );
}
function plot() {
  charts.forEach((c) => c.destroy());
  charts = [];
  const list = data.loans.filter(
      (l) =>
          (!itemFilter || l.item_id == itemFilter) &&
          (!start || l.issued.slice(0, 10) >= start) &&
          (!end || l.issued.slice(0, 10) <= end),
  );
  const done = list.filter((l) => l.returned),
      late = done.filter((l) => l.late).length;
  const minute = (v) => Date.parse(v + "+09:00") / 60000;
  const avg = done.length
      ? Math.round(
          done.reduce(
              (sum, l) => sum + minute(l.returned) - minute(l.issued),
              0,
          ) / done.length,
      )
      : 0;
  const counts = (key, initial = {}) =>
      list.reduce((m, l) => {
        const k = key(l);
        m[k] = (m[k] || 0) + 1;
        return m;
      }, initial);
  const trend = counts((l) => {
    let day = l.issued.slice(0, 10);
    if (period === "month") return day.slice(0, 7);
    if (period === "week") {
      const d = new Date(day + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    }
    return day;
  });
  const ordered = Object.fromEntries(
      Object.entries(trend).sort(([a], [b]) => a.localeCompare(b)),
  );
  const byItem = counts(
      (l) => l.title,
      Object.fromEntries(data.home.items.map((i) => [i.title, 0])),
  );
  const weekdays = counts(
      (l) =>
          "일월화수목금토"[
              new Date(l.issued.slice(0, 10) + "T00:00:00Z").getUTCDay()
              ],
      Object.fromEntries([..."월화수목금토일"].map((v) => [v, 0])),
  );
  const blocks = [
    "00–06시",
    "06–09시",
    "09–12시",
    "12–15시",
    "15–18시",
    "18–24시",
  ];
  const times = counts(
      (l) =>
          blocks[
              [6, 9, 12, 15, 18, 24].findIndex(
                  (end) => Number(l.issued.slice(11, 13)) < end,
              )
              ],
      Object.fromEntries(blocks.map((b) => [b, 0])),
  );
  const palette = [
    "#2e3955",
    "#638287",
    "#829aba",
    "#8d7787",
    "#bac8aa",
    "#9faad0",
    "#b99577",
    "#718c69",
  ];
  const legend = Object.keys(byItem)
      .map(
          (name, i) =>
              '<li><i style="background:' +
              palette[i % palette.length] +
              '"></i>' +
              esc(name) +
              "</li>",
      )
      .join("");
  const graphs = [
    ["대여 추이", "line", ordered],
    ["물품별 대여 횟수", "bar", byItem],
    ["물품별 이용 비율", "doughnut", byItem],
    ["요일별 이용", "bar", weekdays],
    ["시간대별 이용", "bar", times],
  ];
  $("#figures").innerHTML =
      '<div class="metrics">' +
      metric("승인 건수", list.length) +
      metric("평균 이용 시간", avg + "분") +
      metric("미반납", list.length - done.length) +
      metric("반환 대기", done.filter((l) => status(l) === "반환 대기").length) +
      "</div>" +
      pair(
          "지각 건수 / 반납 대비 비율",
          late +
          "건 / " +
          (done.length ? ((100 * late) / done.length).toFixed(1) : 0) +
          "%",
      ) +
      '<div class="charts">' +
      graphs
          .map(
              ([name, type, series], i) =>
                  '<section class="card"><h3>' +
                  name +
                  '</h3><div class="plot-area"><canvas id="graph' +
                  i +
                  '" aria-label="' +
                  name +
                  '"></canvas></div>' +
                  (type === "doughnut"
                      ? '<ul class="plot-key">' + legend + "</ul>"
                      : "") +
                  "<details><summary>수치 보기</summary>" +
                  Object.entries(series)
                      .map(([k, v]) => pair(k, v + "건"))
                      .join("") +
                  "</details></section>",
          )
          .join("") +
      "</div>";
  if (window.Chart) Chart.defaults.font.family = "Pretendard, sans-serif";
  if (window.Chart)
    graphs.forEach(([name, type, series], i) =>
        charts.push(
            new Chart($("#graph" + i), {
              type,
              data: {
                labels: Object.keys(series),
                datasets: [
                  {
                    label: name,
                    data: Object.values(series),
                    borderColor: "#536986",
                    backgroundColor:
                        type === "doughnut"
                            ? [
                              "#2e3955",
                              "#638287",
                              "#829aba",
                              "#8d7787",
                              "#bac8aa",
                              "#9faad0",
                              "#b99577",
                              "#718c69",
                            ]
                            : "#7088a9",
                  },
                ],
              },
              options: {
                animation: false,
                maintainAspectRatio: false,
                indexAxis: i === 1 ? "y" : "x",
                scales:
                    type === "doughnut"
                        ? {}
                        : {
                          x: {
                            ticks: {
                              maxRotation: 0,
                              minRotation: 0,
                              autoSkip: true,
                              maxTicksLimit: 8,
                            },
                          },
                          y: { ticks: { precision: 0 } },
                        },
                plugins: { legend: { display: false } },
              },
            }),
        ),
    );
}
function render() {
  if (!data) return;
  charts.forEach((c) => c.destroy());
  charts = [];
  const p = page();
  $("#tabs").innerHTML = Object.entries(pages)
      .map(
          ([k, v]) =>
              '<a href="#' +
              k +
              '" class="' +
              (k === p ? "on" : "") +
              '">' +
              v +
              "</a>",
      )
      .join("");
  let content = {
    overview,
    requests: () => search() + requestList(data.requests.filter(matches)),
    loans: loanList,
    stock,
    people,
    settings,
    stats: statistics,
    staff: () =>
        "<p>월별 당직표의 이름과 일치하는 임원에게 연결됩니다. 전화번호를 등록하면 학생 화면의 전화 버튼이 활성화됩니다. 대표 관리자는 개인 로그인도 설정할 수 있습니다.</p>" +
        data.staff
            .map((s) =>
                record(
                    s.name,
                    s.phone || "번호 미등록",
                    '<div class="staff-actions row-actions">'+btn("수정", "officer(" + s.id + ")") +
                    ($("aside").dataset.master === "true"
                        ? btn("계정 설정", "account(" + s.id + ")")
                        : "")+"</div>",
                ),
            )
            .join(""),
    audit: () =>
        data.audit
            .map((a) => record(a.detail, fmt(a.happened) + " · " + a.actor))
            .join("") || empty("아직 기록된 작업이 없습니다."),
  }[p]();
  app.innerHTML =
      '<div class="sectiontitle"><h1>' +
      pages[p] +
      "</h1><small>" +
      fmt(data.home.now) +
      " 기준</small></div>" +
      content;
  if ($("#search"))
    $("#search").oninput = (e) => {
      query = e.target.value;
      render();
      $("#search").focus();
    };
  app.querySelectorAll('.status-filter input').forEach(input=>{
    input.onchange=()=>{
      filter=input.value;
      render();
      app.querySelector('.status-filter input:checked').focus({preventScroll:true});
    };
  });
  if (p === "stats") {
    plot();
    for (const name of ["start", "end", "itemFilter", "period"])
      app.querySelector("[name=" + name + "]").onchange = (e) => {
        const v = e.target.value;
        if (name === "start") start = v;
        if (name === "end") end = v;
        if (name === "itemFilter") itemFilter = v;
        if (name === "period") period = v;
        plot();
      };
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    data = await api("admin/desk");
    render();
  } catch (e) {
    report(e);
  } finally {
    loading = false;
  }
}
async function mutate(path, form) {
  if (busy) return;
  busy = true;
  try {
    await api("admin/" + path, form);
    if (modal.open) modal.close();
    await refresh();
    notice("저장했습니다.");
  } catch (e) {
    report(e);
  } finally {
    busy = false;
  }
}
async function approveRequest(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  if (!form.querySelector('[name="units"]:checked')) {
    approvalFeedback(form, "배정할 고유번호를 하나 이상 선택해 주세요.");
    return;
  }
  button.disabled = true;
  button.textContent = "승인 중…";
  try {
    await api("admin/" + form.dataset.path, new FormData(form));
    if (form.isConnected && modal.open) modal.close();
    await refresh();
    notice("대여를 승인했습니다.");
  } catch (error) {
    if (form.isConnected) approvalFeedback(form, error.message === "운영 시간 외" ? approvalHoursMessage(error.message) : error.message);
  } finally {
    button.disabled = false;
    button.textContent = "대여 승인";
  }
}

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-path]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.path.startsWith("approve/")) {
    approveRequest(form);
    return;
  }
  mutate(form.dataset.path, new FormData(form));
});
window.addEventListener("hashchange", () => {
  query = "";
  filter = "";
  window.scrollTo(0, 0);
  render();
  refresh();
});
refresh();
setInterval(() => {
  if (
      !document.hidden &&
      !modal.open &&
      !busy &&
      ["overview", "requests", "loans"].includes(page()) &&
      !["INPUT", "SELECT"].includes(document.activeElement.tagName)
  )
    refresh();
}, 3000);
