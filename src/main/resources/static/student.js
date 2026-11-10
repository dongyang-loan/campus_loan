"use strict";
let home,
  duty,
  tab = 0,
  step = 1,
  draft = {},
  selected = "",
  token = "",
  remember = false,
  sending = false;
const imgs = [
  "soccer",
  "basketball",
  "ball",
  "umbrella",
  "battery",
  "battery",
  "glove",
  "racket",
];
const icon = (i) =>
  i.photo
    ? '<img class="catalog-photo" alt="" src="/api/items/' +
      i.id +
      "/photo?v=" +
      esc(i.photo) +
      '">'
    : !imgs[i.id - 1]
      ? '<span class="item-initial" aria-hidden="true">' +
        esc(i.title.slice(0, 1)) +
        "</span>"
      : '<img alt="" src="/img/' + imgs[i.id - 1] + '.svg">';
const itemById = (id) => home.items.find((i) => i.id == id);
const route = () => location.hash.slice(1) || "home";
const time = (v) => String(v).slice(0, 5);
const hours = () => time(home.policy.opens) + " – " + time(home.policy.closes);
const dueLabel = (i) => (i.next_day ? "다음 날 반납" : "당일 반납");
const docs = ["이용 절차", "물품 안내", "유의사항", "FAQ"];
const rules = [
  "현금 보증금 10,000원 이상을 준비해 주세요.",
  "학생증 등 실물 신분증을 지참해 주세요.",
  "신청 후 3호관 1층 112호 총학생회실에서 직접 수령해 주세요.",
  "관계자 부재 시 오늘의 당직자에게 전화해 주세요.",
  "우산은 다음 날, 그 외 물품은 당일 마감까지 반납해 주세요.",
];
function contacts() {
  if (!duty) return "<small>당직표 확인 중…</small>";
  if (duty.failed)
    return "<small>당직표를 읽지 못했습니다. 잠시 후 다시 확인해 주세요.</small>";
  if (!duty.contacts.length)
    return "<small>오늘 등록된 당직자가 없습니다.</small>";
  return duty.contacts
    .map((c) =>
      /^01[016789]\d{7,8}$/.test(c.phone)
        ? '<a class="btn" aria-label="' +
          c.label +
          ' 전화하기" href="tel:' +
          c.phone +
          '">' +
          c.label +
          " 전화</a>"
        : '<span class="badge">' + c.label + " · 연락처 미등록</span>",
    )
    .join(" ");
}
function callbox() {
  return (
    '<section class="callbox"><img src="/img/call.svg" alt=""><div><h3>오늘의 당직자에게 전화하기</h3><p>총학생회실에 관계자가 없으면 연락해 주세요.</p><div class="chips duty">' +
    contacts() +
    "</div></div></section>"
  );
}
function inventory() {
  return home.items
    .map(
      (i) =>
        '<button class="item" onclick="detail(' +
        i.id +
        ')">' +
        icon(i) +
        "<span>" +
        esc(i.title) +
        "<small>총 " +
        i.total +
        "개 · 대여 중 " +
        i.rented +
        '개</small></span><span class="num">' +
        i.available +
        '개<small>대여 가능</small></span><span aria-hidden="true">›</span></button>',
    )
    .join("");
}
function landing() {
  return (
    '<div class="homegrid"><div><section class="hero"><span class="pill">' +
    esc(home.closed || "운영 중") +
    '</span><small>필요할 때, 언제든지</small><h1>빌려드립니다</h1><p>한울타리 총학생회 물품 대여 서비스</p></section><a href="#apply" class="btn primary cta wide"><img src="/img/box.svg" alt="">대여하기<span>→</span></a>' +
    callbox() +
    '</div><section><div class="sectiontitle"><h2>현재 대여 가능한 물품</h2><small>' +
    fmt(home.now).slice(5) +
    ' 기준</small></div><div class="items">' +
    inventory() +
    "</div></section></div>"
  );
}
function detail(id) {
  const i = itemById(id);
  popup(
    icon(i) +
      "<h2>" +
      esc(i.title) +
      "</h2>" +
      pair("전체 수량", i.total + "개") +
      pair("대여 중", i.rented + "개") +
      pair("대여 가능", i.available + "개") +
      pair("반납 원칙", dueLabel(i)) +
      '<p class="pickup-note">' +
      esc(
        id === 7
          ? "글러브 고유번호를 배정하고 야구공 수량은 현장에서 기록합니다."
          : id === 8
            ? "라켓 고유번호를 배정하고 셔틀콕 수량은 현장에서 기록합니다."
            : "총학생회실에서 실물 상태와 고유번호를 확인한 뒤 수령하세요.",
      ) +
      "</p>" +
      btn("이 물품 대여하기", "begin(" + id + ")", "primary wide"),
  );
}
function begin(id) {
  modal.close();
  selected = id;
  location.hash = "apply";
}
function guide() {
  const steps = [
    "홈에서 물품을 선택하고 신청서를 작성합니다.",
    "총학생회실을 방문합니다.",
    "현금 보증금 10,000원 이상과 실물 신분증을 제출합니다.",
    "담당자가 승인한 물품을 수령합니다.",
    "기한 내 반납하고 보증금과 신분증을 돌려받습니다.",
  ];
  let question = 0;
  const faq = faqSections
    .map(
      ([title, entries], i) =>
        '<section class="faq-group"><h3>' +
        String(i + 1).padStart(2, "0") +
        " · " +
        title +
        "</h3>" +
        entries
          .map(
            ([q, a]) =>
              "<details><summary><b>Q" +
              ++question +
              "</b><span>" +
              esc(q) +
              '</span></summary><div class="answer">' +
              a
                .split("\n")
                .map((p) => "<p>" + esc(p) + "</p>")
                .join("") +
              "</div></details>",
          )
          .join("") +
        "</section>",
    )
    .join("");
  const contents = [
    '<ol class="guide-list">' +
      steps.map((s) => "<li>" + s + "</li>").join("") +
      "</ol>",
    '<div class="guide-items">' +
      home.items
        .map(
          (i) =>
            "<div><b>" +
            esc(i.title) +
            "</b><small>" +
            dueLabel(i) +
            "</small></div>",
        )
        .join("") +
      "</div>",
    '<ul class="guide-list">' +
      [
        ...rules,
        "지각 누적 3회부터 신규 대여가 제한됩니다.",
        "파손·분실은 즉시 총학생회에 알려 주세요.",
      ]
        .map((s) => "<li>" + s + "</li>")
        .join("") +
      "</ul>",
    '<p class="faq-intro">빌려드립니다 서비스 이용과 관련하여 자주 문의하는 사항을 안내드립니다.</p>' +
      faq,
  ];
  return (
    '<div class="guide-head"><h1>빌려드립니다 이용 안내</h1></div><div class="tabbar">' +
    docs
      .map((s, i) => btn(s, "tab=" + i + ";render()", tab === i ? "on" : ""))
      .join("") +
    '</div><section class="panel guide-panel"><h2>' +
    (tab === 3 ? "자주 묻는 질문 (FAQ)" : docs[tab]) +
    "</h2>" +
    contents[tab] +
    "</section>"
  );
}
function operating() {
  return (
    '<div class="guide-head"><h1>운영 시간 안내</h1></div><section class="panel"><span class="pill">' +
    esc(home.closed || "운영 중") +
    "</span><h2>정기 운영 시간</h2>" +
    [..."월화수목금토일"]
      .map((day, i) =>
        pair(
          day + "요일",
          home.policy.weekdays.includes(i + 1) ? hours() : "휴무",
        ),
      )
      .join("") +
    '</section><section class="panel closure-list"><h2>대여 중단 기간</h2>' +
    (home.closures
      .map(
        (c) =>
          "<article><strong>" +
          esc(c.reason) +
          "</strong><small>" +
          esc(c.starts) +
          " – " +
          esc(c.ends) +
          "</small></article>",
      )
      .join("") ||
      '<p class="closure-empty">예정된 대여 중단 기간이 없습니다.</p>') +
    "</section>"
  );
}
function resetForm() {
  step = 1;
  draft = {};
  remember = false;
  try {
    const saved = localStorage.getItem("loan.profile");
    if (saved) {
      draft = JSON.parse(saved);
      remember = true;
    }
  } catch {}
  draft.item = selected;
  selected = "";
  // randomUUID is unavailable over plain HTTP on a phone connected by LAN.
  token = "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  );
}
function departments() {
  return (
    opt("", "학과를 선택해 주세요.") +
    (home.departments[draft.faculty] || [])
      .map((s) => opt(s, s, s === draft.department))
      .join("")
  );
}
function wizard() {
  const asset = (name) =>
    '<img alt="" src="/img/apply/' + step + "-" + name + '.svg">';
  const progress =
    '<div class="progress-dots" aria-label="총 3단계 중 ' +
    step +
    '단계">' +
    [1, 2, 3]
      .map((n, i) => {
        const ellipse =
          step === 1 ? (n === 1 ? 1 : 2) : step === 2 ? (n <= 2 ? 2 : 3) : 3;
        const line = i ? asset("Line" + (step === 2 && i === 2 ? 2 : 1)) : "";
        return (
          line +
          '<span class="' +
          (n <= step ? "done" : "") +
          '">' +
          asset("Ellipse" + ellipse) +
          "<b>" +
          n +
          "</b></span>"
        );
      })
      .join("") +
    "</div>";
  const next = (text, action = "") =>
    '<button class="primary advance" ' +
    (action ? 'type="button" onclick="' + action + '"' : 'type="submit"') +
    ">" +
    text +
    asset(step === 3 ? "DashiconsArrowRightAlt3" : "DashiconsArrowRightAlt2") +
    "</button>";
  let body = "";
  if (step === 1) {
    const titles = [
      "현금 보증금 10,000원 이상 필요",
      "신분증 지참 필요",
      "총학생회실에서 직접 수령",
      "부재 시 당직자에게 전화",
    ];
    body =
      '<h2>이용 전에<br>꼭 확인해 주세요!</h2><p class="hint">원활한 대여를 위해 아래 안내 사항을 확인해 주세요.</p><div class="rule-cards">' +
      titles
        .map(
          (t, i) =>
            "<article>" +
            asset("Frame" + (8 + i)) +
            "<div><strong>" +
            t +
            "</strong><p>" +
            esc(rules[i]) +
            "</p></div></article>",
        )
        .join("") +
      "</div>" +
      next("다음으로", "go(2)");
  }
  if (step === 2)
    body =
      '<h2>신청 정보를 입력해 주세요.</h2><p class="hint">정확한 정보 입력은 원활한 대여에 도움이 됩니다.</p><form id="requestForm">' +
      select(
        "faculty",
        "학부",
        opt("", "학부를 선택해 주세요.") +
          Object.keys(home.departments)
            .map((s) => opt(s, s, s === draft.faculty))
            .join(""),
      ) +
      select("department", "학과", departments()) +
      field(
        "studentNo",
        "학번",
        draft.studentNo,
        "text",
        'inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" placeholder="학번을 입력해 주세요." required',
      ) +
      field(
        "phone",
        "휴대전화 번호",
        draft.phone,
        "tel",
        'pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" placeholder="전화번호를 입력해 주세요." required',
      ) +
      field(
        "name",
        "이름",
        draft.name,
        "text",
        'maxlength="50" placeholder="이름을 입력해 주세요." required',
      ) +
      select(
        "item",
        "신청 물품",
        opt("", "신청 물품을 선택해 주세요.") +
          home.items
            .map((i) => opt(i.id, i.title, i.id == draft.item))
            .join(""),
      ) +
      check("remember", "이 기기에 신청 정보 저장", remember) +
      (remember ? btn("저장 정보 삭제", "forget()") : "") +
      next("다음으로") +
      "</form>";
  if (step === 3) {
    const item = itemById(draft.item);
    if(!item){step=2;draft.item='';notice('해당 물품이 삭제되었습니다. 다른 물품을 선택해 주세요.');return wizard();}
    const [h, m] = item.due.slice(11, 16).split(":");
    const due =
      (item.next_day ? "내일 " : "오늘 ") +
      Number(h) +
      "시" +
      (Number(m) ? " " + Number(m) + "분" : "") +
      "까지";
    body =
      '<h2>반납 기한을 확인해 주세요.</h2><p class="hint">지정된 기한까지 반납해 주세요. 기한을 넘기면 지각으로 기록됩니다.</p><section class="due-card">' +
      asset("Group") +
      "<div><b>반납 기한</b><strong>" +
      due +
      "</strong><small>" +
      fmt(item.due) +
      '까지 반납 예정입니다.</small></div></section><section class="confirm-card"><div class="confirm-title"><b>신청 정보 확인</b><button onclick="go(2)">수정하기 ' +
      asset("PhBracketsAngle") +
      "</button></div>" +
      pair("학부", draft.faculty) +
      pair("학과", draft.department) +
      pair("학번", draft.studentNo) +
      pair("전화번호", draft.phone) +
      pair("이름", draft.name) +
      pair("신청 물품", item.title) +
      "</section>" +
      '<form id="consent-form"><div class="consent-note"><strong>개인정보 수집·이용</strong><p>총학생회는 대여 신청, 본인 확인, 반납 안내와 대여 이력 관리를 위해 학부·학과·학번·이름·전화번호를 수집합니다. 동의를 거부하면 온라인 신청이 제한됩니다.</p>' +
      check("consent", "개인정보 수집·이용에 동의합니다 (필수)", false, true) +
      "</div>" +
      next("신청하기") +
      "</form>";
  }
  return (
    '<div class="wizard-bar"><button aria-label="이전" onclick="wizardBack()">' +
    asset(step === 3 ? "DashiconsArrowRightAlt2" : "DashiconsArrowRightAlt3") +
    "</button><h1>대여하기</h1></div>" +
    progress +
    '<section class="wizard-body">' +
    body +
    "</section>"
  );
}
function wizardBack() {
  if (step === 1) {
    location.hash = "home";
    return;
  }
  if (step === 2) saveDraft();
  go(step - 1);
}
function go(n) {
  step = n;
  render();
  window.scrollTo(0, 0);
}
function saveDraft() {
  const f = $("#requestForm");
  draft = Object.fromEntries(new FormData(f));
  remember = f.remember.checked;
}
function forget() {
  localStorage.removeItem("loan.profile");
  draft = { item: draft.item };
  remember = false;
  render();
  notice("저장한 신청 정보를 삭제했습니다.");
}
async function submitRequest() {
  if (sending) return;
  sending = true;
  try {
    await api("requests", { ...draft, token, consent: "yes" });
    try {
      if (remember) {
        const { item, remember: unused, ...profile } = draft;
        localStorage.setItem("loan.profile", JSON.stringify(profile));
      } else localStorage.removeItem("loan.profile");
    } catch {}
    app.innerHTML =
      '<section class="panel receipt"><h1>신청이 접수되었습니다</h1>' +
      '<p>현금 10,000원 이상과 실물 신분증을 가지고 총학생회실을 방문해 주세요.</p><a href="#home" class="btn primary wide">홈으로</a></section>';
  } catch (e) {
    report(e);
  } finally {
    sending = false;
  }
}
function render() {
  if (!home) return;
  const page = route();
  document.body.classList.toggle("applying", page === "apply");
  app.className = page === "apply" ? "wizard" : page === "home" ? "" : "narrow";
  app.innerHTML =
    page === "home"
      ? landing()
      : page === "guide"
        ? guide()
        : page === "hours"
          ? operating()
          : page === "contact"
            ? '<div class="guide-head"><h1>당직자에게 전화하기</h1></div><p>' +
              esc(home.now.slice(0, 10)) +
              " · 총학생회실</p>" +
              callbox()
            : page === "apply"
              ? wizard()
              : landing();
  const consentForm = $("#consent-form");
  if (consentForm) {
    const consent=consentForm.elements.consent;
    const validate=()=>consent.setCustomValidity(consent.checked ? "" : "개인정보 수집·이용에 동의하지 않으면 대여할 수 없습니다.");
    validate();
    consent.addEventListener("change",validate);
    consentForm.onsubmit = (e) => {
      e.preventDefault();
      submitRequest();
    };
  }
  const f = $("#requestForm");
  if (f) {
    f.faculty.onchange = () => {
      draft.faculty = f.faculty.value;
      draft.department = "";
      f.department.innerHTML = departments();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      saveDraft();
      go(3);
    };
  }
}
$("#menu").onclick = () => $("#drawer").showModal();
$("#drawer").onclick = (e) => {
  if (e.target.closest("button,a") || e.target === $("#drawer"))
    $("#drawer").close();
};
window.addEventListener("hashchange", () => {
  if (route() === "apply") resetForm();
  render();
  scrollTo(0, 0);
});
async function refresh() {
  try {
    home = await api("home");
    if (route() === "apply" && !token) resetForm();
    if (["home", "hours"].includes(route()) || !app.querySelector("h1"))
      render();
  } catch (e) {
    report(e);
  }
}
let dutyStream;
function displayDuty(snapshot){
  duty=snapshot;
  document.querySelectorAll(".duty").forEach(el=>el.innerHTML=contacts());
}
function connectDuty(){
  const needed=!document.hidden && ["home","contact"].includes(route());
  if(!needed){dutyStream?.close();dutyStream=null;duty=null;return;}
  if(dutyStream)return;
  const stream=new EventSource("/api/duty/events");dutyStream=stream;
  stream.onmessage=e=>{if(stream===dutyStream)displayDuty(JSON.parse(e.data));};
  stream.onerror=()=>{if(stream===dutyStream)displayDuty({failed:true});};
}
refresh();
connectDuty();
setInterval(()=>{if(!document.hidden)refresh();},4000);
document.addEventListener("visibilitychange",connectDuty);
window.addEventListener("hashchange",connectDuty);
window.addEventListener("pagehide",()=>{dutyStream?.close();dutyStream=null;});
window.addEventListener("pageshow",connectDuty);
document.addEventListener("pointerdown",()=>document.body.classList.add("pointer-mode"),true);
document.addEventListener("keydown",()=>document.body.classList.remove("pointer-mode"),true);
