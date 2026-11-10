package kr.ac.dongyang.loan;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;

@Service
@Transactional
class AdminService {
  final Desk d;

  AdminService(Desk d) {
    this.d = d;
  }

  @Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Map<String, Object> snapshot() {
    return Map.of(
        "requests",
        d.rows(
            "select a.*,i.title from application a join item i on i.id=a.item_id where"
                + " a.state='PENDING' order by a.id desc"),
        "loans",
        d.rows(
            """
select l.*,a.student_no,a.name,a.phone,a.faculty,a.department,a.item_id,i.title,s.name officer,
(select listagg(u.code,', ') within group(order by u.code) from allocation x join unit u on u.id=x.unit_id where x.loan_id=l.id) codes
from loan l join application a on a.id=l.request_id join item i on i.id=a.item_id join staff s on s.id=l.staff_id order by l.id desc
"""),
        "units",
        d.rows("select * from unit order by item_id,id"),
        "staff",
        d.rows("select * from staff order by id"),
        "borrowers",
        d.rows(
            "select b.*,(select max(a.name) from application a where a.student_no=b.student_no)"
                + " name from borrower b order by late_count desc,student_no"),
        "audit",
        d.rows("select * from audit order by id desc fetch first 200 rows only"),
        "home",
        d.home(),
        "todayRequests",
        d.count(
            "select count(*) from application where created>=? and created<?",
            d.now().toLocalDate(),
            d.now().toLocalDate().plusDays(1)));
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> reasons(String student) {
    d.check(student.matches("[0-9]{8}"), "학번을 확인해 주세요.");
    return d.rows(
        """
        select e.happened,e.actor,e.detail from audit e
        where e.detail like concat('학번 ',?,' 제한 %')
        or exists(select 1 from loan l join application a on a.id=l.request_id
          where a.student_no=? and (e.detail like concat('대여 #',l.id,' 지각 정정 · %')
             or e.detail=concat('대여 #',l.id,' 반납 · 지각')))
        order by e.id desc
        """,
        student, student);
  }

  public void change(String action, MultiValueMap<String, String> f) {
    d.lock();
    if ("policy".equals(action)) {
      String days = String.join("", f.getOrDefault("days", List.of()));
      var opens = LocalTime.parse(d.field(f, "opens", 8));
      var closes = LocalTime.parse(d.field(f, "closes", 8));
      d.check(days.matches("[1-7]{0,7}") && opens.isBefore(closes), "운영 요일과 시작·종료 시각을 확인해 주세요.");
      d.database()
          .update(
              "update policy set weekdays=?,opens=?,closes=?,cutoff=? where id=1",
              days,
              opens,
              closes,
              closes);
      d.audit("운영 시간 변경 · " + days + " / " + opens + "–" + closes);
      return;
    }
    if ("closure".equals(action)) {
      var start = LocalDate.parse(d.field(f, "starts", 10));
      var end = LocalDate.parse(d.field(f, "ends", 10));
      String reason = d.field(f, "reason", 180);
      d.check(!end.isBefore(start), "중단 종료일을 확인해 주세요.");
      d.database()
          .update("insert into closure(starts,ends,reason) values(?,?,?)", start, end, reason);
      d.audit("중단 기간 등록 · " + start + " ~ " + end + " " + reason);
      return;
    }
    long id = d.number(f, "id");
    if ("add-unit".equals(action))
      d.check(d.count("select count(*) from retired_item where item_id=?", id) == 0, "삭제된 물품입니다.");
    if ("unit".equals(action) || "remove-unit".equals(action))
      d.check(
          d.count(
                  "select count(*) from retired_item r join unit u on u.item_id=r.item_id where"
                      + " u.id=?",
                  id)
              == 0,
          "삭제된 물품입니다.");
    switch (action) {
      case "delete-item" -> {
        d.check(
            d.count(
                    "select count(*) from item where id=? and id not in(select item_id from"
                        + " retired_item)",
                    id)
                == 1,
            "이미 삭제되었거나 없는 물품입니다.");
        d.check(
            d.count("select count(*) from application where item_id=? and state='PENDING'", id)
                == 0,
            "대기 신청을 먼저 처리해 주세요.");
        d.check(
            d.count("select count(*) from unit where item_id=? and state='OUT'", id) == 0,
            "대여 중인 물품은 모두 반납된 뒤 삭제할 수 있습니다.");
        d.database().update("insert into retired_item(item_id) values(?)", id);
        d.audit(
            "물품 삭제 · "
                + d.database()
                    .queryForObject("select title from item where id=?", String.class, id));
        return;
      }
      case "cancel" ->
          d.check(
              d.database()
                      .update(
                          "update application set state='CANCELLED' where id=? and state='PENDING'",
                          id)
                  == 1,
              "대기 신청만 삭제할 수 있습니다.");
      case "settle" ->
          d.check(
              d.database()
                      .update(
                          "update loan set deposit_back=deposit_back or ?,card_back=card_back or ?"
                              + " where id=? and returned is not null",
                          f.containsKey("deposit"),
                          f.containsKey("card"),
                          id)
                  == 1,
              "반납 정보를 확인해 주세요.");
      case "add-unit" ->
          d.database()
              .update(
                  "insert into unit(item_id,code,state) values(?,?,'AVAILABLE')",
                  id,
                  d.field(f, "code", 32));
      case "unit" ->
          d.check(
              d.database()
                      .update(
                          "update unit set state=case when state='AVAILABLE' then 'DISABLED' else"
                              + " 'AVAILABLE' end where id=? and state<>'OUT'",
                          id)
                  == 1,
              "대여 중인 고유번호입니다.");
      case "remove-unit" ->
          d.check(
              d.database()
                      .update(
                          "delete from unit where id=? and state<>'OUT' and not exists(select 1"
                              + " from allocation where unit_id=?)",
                          id,
                          id)
                  == 1,
              "대여 이력이 있는 번호는 사용 불가로 변경해 주세요.");
      case "end-closure" -> d.database().update("delete from closure where id=?", id);
      case "password" -> {
        String password = d.field(f, "password", 70);
        d.check(
            password.length() >= 8
                && password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72,
            "비밀번호는 8자 이상, UTF-8 72바이트 이하로 입력해 주세요.");
        String hash =
            "{bcrypt}"
                + new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
                    .encode(password);
        d.database()
            .update(
                "merge into staff_login(staff_id,username,password_hash) key(staff_id)"
                    + " values(?,?,?)",
                id,
                "staff" + id,
                hash);
      }
      case "staff" -> {
        String phone = Objects.toString(f.getFirst("phone"), "").replace("-", "").strip();
        d.check(phone.isEmpty() || phone.matches("01[016789][0-9]{7,8}"), "휴대전화 번호를 확인해 주세요.");
        d.database()
            .update(
                "update staff set name=?,phone=? where id=?", d.field(f, "name", 50), phone, id);
      }
      case "restriction" -> {
        String reason = d.field(f, "reason", 180);
        d.database()
            .update(
                "update borrower set suspended=? where student_no=?",
                f.containsKey("suspend"),
                d.field(f, "studentNo", 8));
        d.audit(
            "학번 "
                + f.getFirst("studentNo")
                + " 제한 "
                + (f.containsKey("suspend") ? "설정" : "해제")
                + " · "
                + reason);
        return;
      }
      case "correct" -> {
        String reason = d.field(f, "reason", 180);
        boolean late = f.containsKey("late");
        var row =
            d.rows(
                "select a.student_no,l.late from loan l join application a on a.id=l.request_id"
                    + " where l.id=? and l.returned is not null",
                id);
        d.check(
            !row.isEmpty() && !Objects.equals(row.get(0).get("late"), late), "변경할 지각 상태를 확인해 주세요.");
        d.database().update("update loan set late=? where id=?", late, id);
        d.database()
            .update(
                "update borrower set late_count=late_count+?,suspended=(suspended or (? and"
                    + " late_count+1>=3)) where student_no=?",
                late ? 1 : -1,
                late,
                row.get(0).get("student_no"));
        d.audit("대여 #" + id + " 지각 정정 · " + (late ? "지각 처리" : "정상 처리") + " · " + reason);
        return;
      }
      default -> throw new IllegalArgumentException();
    }
    d.audit(action + " #" + id);
  }
}
