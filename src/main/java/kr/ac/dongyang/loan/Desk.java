package kr.ac.dongyang.loan;

import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
class Desk {
  final JdbcTemplate db;
  final RequestRepository requests;
  final Clock clock;

  Desk(JdbcTemplate db, RequestRepository requests, Clock clock) {
    this.db = db;
    this.requests = requests;
    this.clock = clock;
  }

  JdbcTemplate database() {
    return db;
  }

  LocalDateTime now() {
    return LocalDateTime.now(clock);
  }

  // One short write queue for this single-campus desk. Every state transition takes this DB lock
  // first.
  void lock() {
    db.queryForObject("select id from policy where id=1 for update", Integer.class);
  }

  void check(boolean ok, String why) {
    if (!ok) throw new ResponseStatusException(HttpStatus.CONFLICT, why);
  }

  String field(MultiValueMap<String, String> f, String key, int max) {
    String s = Objects.toString(f.getFirst(key), "").strip();
    check(!s.isEmpty() && s.length() <= max, "입력값을 확인해 주세요 (" + key + ")");
    return s;
  }

  long number(MultiValueMap<String, String> f, String k) {
    return Long.parseLong(field(f, k, 16));
  }

  int count(String sql, Object... args) {
    return db.queryForObject(sql, Integer.class, args);
  }

  List<Map<String, Object>> rows(String sql, Object... args) {
    return db.query(
        sql,
        (rs, n) -> {
          var row = new LinkedHashMap<String, Object>();
          for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
            Object v = rs.getObject(i);
            row.put(
                rs.getMetaData().getColumnLabel(i).toLowerCase(Locale.ROOT),
                v instanceof Timestamp t
                    ? t.toLocalDateTime().toString()
                    : v instanceof java.util.Date ? v.toString() : v);
          }
          return row;
        },
        args);
  }

  Map<String, Object> policy() {
    return rows("select * from policy where id=1").get(0);
  }

  String closed(LocalDateTime t, Map<String, Object> p) {
    var closure =
        rows(
            "select reason from closure where ? between starts and ends order by starts,id",
            t.toLocalDate());
    if (!closure.isEmpty()) return "대여 중단 · " + closure.get(0).get("reason");
    if (!p.get("weekdays").toString().contains("" + t.getDayOfWeek().getValue())) return "휴무일";
    var time = t.toLocalTime();
    return time.isBefore(LocalTime.parse("" + p.get("opens")))
            || !time.isBefore(LocalTime.parse("" + p.get("closes")))
        ? "운영 시간 외"
        : "";
  }

  LocalDateTime due(long itemId, LocalDateTime t, Map<String, Object> p) {
    boolean next = db.queryForObject("select next_day from item where id=?", Boolean.class, itemId);
    return t.toLocalDate().plusDays(next ? 1 : 0).atTime(LocalTime.parse("" + p.get("closes")));
  }

  @Transactional(readOnly = true)
  public Map<String, Object> home() {
    var t = now();
    var p = policy();
    var items =
        rows(
            """
select i.*,(select revision from item_photo where item_id=i.id) photo,count(u.id) total,count(case when state='OUT' then 1 end) rented,
count(case when state='AVAILABLE' then 1 end) available
from item i left join unit u on i.id=u.item_id where not exists(select 1 from retired_item z where z.item_id=i.id) group by i.id order by i.id
""");
    for (var i : items) i.put("due", due(((Number) i.get("id")).longValue(), t, p).toString());
    return Map.of(
        "now",
        t.toString(),
        "closed",
        closed(t, p),
        "policy",
        p,
        "items",
        items,
        "departments",
        Catalog.departments,
        "closures",
        rows("select * from closure where ends>=? order by starts", t.toLocalDate()));
  }

  public long apply(MultiValueMap<String, String> f) {
    lock();
    var r = new RentalRequest();
    r.token = UUID.fromString(field(f, "token", 40)).toString();
    var existing = requests.findByToken(r.token);
    if (existing.isPresent()) return existing.get().id;
    check("yes".equals(f.getFirst("consent")), "개인정보 수집·이용에 동의해 주세요.");
    r.consentAt = now();
    r.studentNo = field(f, "studentNo", 8);
    r.phone = field(f, "phone", 20).replace("-", "");
    r.faculty = field(f, "faculty", 64);
    r.department = field(f, "department", 64);
    r.name = field(f, "name", 50);
    r.itemId = number(f, "item");
    r.created = now();
    r.state = "PENDING";
    check(
        r.studentNo.matches("[0-9]{8}") && r.phone.matches("01[016789][0-9]{7,8}"),
        "학번 8자리와 휴대전화 번호를 확인해 주세요.");
    check(
        Catalog.departments.getOrDefault(r.faculty, List.of()).contains(r.department),
        "소속 학부와 학과를 확인해 주세요.");
    var p = policy();
    String reason = closed(r.created, p);
    check(reason.isEmpty(), reason);
    check(
        count(
                "select count(*) from unit u join item i on i.id=u.item_id where i.id=? and"
                    + " u.state='AVAILABLE' and not exists(select 1 from retired_item z where"
                    + " z.item_id=i.id)",
                r.itemId)
            > 0,
        "현재 대여 가능한 재고가 없습니다.");
    check(!r.created.isAfter(due(r.itemId, r.created, p)), "오늘 반납 마감 시간이 지났습니다.");
    if (count("select count(*) from borrower where student_no=?", r.studentNo) == 0)
      db.update("insert into borrower(student_no) values(?)", r.studentNo);
    eligible(r.studentNo);
    return requests.saveAndFlush(r).id;
  }

  void eligible(String student) {
    check(
        count(
                "select count(*) from loan l join application a on a.id=l.request_id where"
                    + " a.student_no=? and l.returned is null",
                student)
            == 0,
        "미반납 물품이 있습니다. 반납 후 다시 대여해 주세요.");
    check(
        count("select count(*) from borrower where student_no=? and suspended", student) == 0,
        "대여가 제한된 학번입니다. 총학생회에 문의해 주세요.");
  }

  void audit(String text) {
    var auth =
        org.springframework.security.core.context.SecurityContextHolder.getContext()
            .getAuthentication();
    db.update(
        "insert into audit(happened,actor,detail) values(?,?,?)",
        now(),
        auth == null ? "system" : auth.getName(),
        text);
  }

  public void approve(long id, MultiValueMap<String, String> f) {
    lock();
    var r = requests.findById(id).orElseThrow();
    check("PENDING".equals(r.state), "이미 처리된 신청입니다.");
    eligible(r.studentNo);
    var t = now();
    var p = policy();
    String reason = closed(t, p);
    check(reason.isEmpty(), reason);
    var deadline = due(r.itemId, t, p);
    check(!t.isAfter(deadline), "반납 마감 시간이 지났습니다.");
    var units = f.getOrDefault("units", List.of());
    check(!units.isEmpty(), "고유번호를 선택해 주세요.");
    long staff = number(f, "staff");
    check(count("select count(*) from staff where id=?", staff) == 1, "담당자를 확인해 주세요.");
    boolean deposit = f.containsKey("deposit"), card = f.containsKey("card");
    String exceptionReason = null;
    if (!deposit || !card) {
      check(f.containsKey("exception"), "수령 항목을 확인하거나 미제출 예외를 선택해 주세요.");
      exceptionReason = field(f, "exceptionReason", 180);
    }
    String memo = Objects.toString(f.getFirst("memo"), "").strip();
    check(memo.length() <= 500, "비고는 500자 이하입니다.");
    db.update(
        "insert into"
            + " loan(request_id,staff_id,issued,due,deposit_received,card_received,memo,exception_reason)"
            + " values(?,?,?,?,?,?,?,?)",
        id,
        staff,
        t,
        deadline,
        deposit,
        card,
        memo,
        exceptionReason);
    long loan = db.queryForObject("select id from loan where request_id=?", Long.class, id);
    for (String unit : units) {
      long uid = Long.parseLong(unit);
      check(
          db.update(
                  "update unit set state='OUT' where id=? and item_id=? and state='AVAILABLE'",
                  uid,
                  r.itemId)
              == 1,
          "선택한 고유번호의 재고가 변경되었습니다.");
      db.update("insert into allocation values(?,?)", loan, uid);
    }
    r.state = "APPROVED";
    audit("신청 #" + id + " 승인 · 대여 #" + loan);
  }

  public void finish(long id, MultiValueMap<String, String> f) {
    lock();
    var t = now();
    var loans =
        rows(
            "select l.*,a.student_no from loan l join application a on a.id=l.request_id where"
                + " l.id=?",
            id);
    check(!loans.isEmpty(), "대여 기록이 없습니다.");
    var loan = loans.get(0);
    check(loan.get("returned") == null, "이미 반납되었습니다.");
    boolean deposit = Boolean.TRUE.equals(loan.get("deposit_received"));
    boolean card = Boolean.TRUE.equals(loan.get("card_received"));
    check(!deposit || f.containsKey("deposit"), "수령했던 보증금의 반환을 확인해 주세요.");
    check(!card || f.containsKey("card"), "수령했던 신분증의 반환을 확인해 주세요.");
    boolean late = t.isAfter(LocalDateTime.parse("" + loan.get("due")));
    db.update(
        "update loan set returned=?,late=?,deposit_back=?,card_back=? where id=?",
        t,
        late,
        deposit,
        card,
        id);
    db.update(
        "update unit set state='AVAILABLE' where id in(select unit_id from allocation where"
            + " loan_id=?)",
        id);
    if (late) {
      boolean autoSuspend =
          count(
                  "select count(*) from borrower where student_no=? and not suspended and"
                      + " late_count>=2",
                  loan.get("student_no"))
              == 1;
      if (autoSuspend) audit("학번 " + loan.get("student_no") + " 제한 설정 · 지각 누적 3회 이상으로 자동 제한");
      db.update(
          "update borrower set suspended=(suspended or late_count+1>=3),late_count=late_count+1"
              + " where student_no=?",
          loan.get("student_no"));
    }
    audit("대여 #" + id + " 반납" + (late ? " · 지각" : ""));
  }
}
