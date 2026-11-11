package kr.ac.dongyang.loan;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;

@Service
@Transactional
class AdminService {
  @org.springframework.beans.factory.annotation.Value("${app.sheet-id}")
  String defaultSheet;
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
select l.*,a.student_no,a.name,a.phone,a.faculty,a.department,a.item_id,i.title,coalesce(s.archived_name,s.name) officer,
(select listagg(u.code,', ') within group(order by u.code) from allocation x join unit u on u.id=x.unit_id where x.loan_id=l.id) codes
from loan l join application a on a.id=l.request_id join item i on i.id=a.item_id join staff s on s.id=l.staff_id order by l.id desc
"""),
        "units",
        d.rows("select * from unit order by item_id,id"),
        "staff",
        d.rows("select s.id,s.name,s.phone,l.username from staff s left join staff_login l on l.staff_id=s.id where s.archived_name is null order by s.id"),
        "sheetId", d.database().queryForObject(
            "select coalesce((select sheet_id from duty_source where id=1), ?)", String.class, defaultSheet),
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
    if ("sheet".equals(action)) {
      String input = d.field(f, "sheet", 512);
      var match = java.util.regex.Pattern.compile(
          "(?:https://docs[.]google[.]com/spreadsheets/d/)?([A-Za-z0-9_-]{10,128})(?:/[?#A-Za-z0-9_=&.%/-]*)?").matcher(input);
      d.check(match.matches(), "Google 스프레드시트 공유 주소 또는 문서 ID를 입력해 주세요.");
      d.database().update("merge into duty_source(id,sheet_id) key(id) values(1,?)", match.group(1));
      d.audit("당직표 연결 변경");
      return;
    }
    if ("roster".equals(action)) {
      String[] names = d.field(f, "names", 5000).lines().map(String::strip)
          .filter(n -> !n.isEmpty()).toArray(String[]::new);
      d.check(names.length > 0 && names.length <= 100, "임원을 1~100명 입력해 주세요.");
      var unique = new HashSet<String>();
      for (var name : names)
        d.check(name.length() <= 50 && !name.startsWith("~") && unique.add(DutyService.normalize(name)),
            "중복되거나 잘못된 이름이 있습니다.");
      d.check("on".equals(f.getFirst("confirm")), "기존 임원 계정 해제를 확인해 주세요.");
      d.check(d.number(f, "lastStaff") == d.database().queryForObject("select coalesce(max(id),0) from staff", Long.class), "명단이 변경되었습니다. 새로고침해 주세요.");
      d.database().update("delete from staff_login");
      d.database().update("update staff set archived_name=name,name=concat('~',random_uuid()),phone='' where archived_name is null");
      long next = d.database().queryForObject("select coalesce(max(id),0)+1 from staff", Long.class);
      for (var name : names)
        d.database().update("insert into staff(id,name,phone) values(?,?, '')", next++, name);
      d.audit("임원 명단 교체 · " + names.length + "명");
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
        d.check(d.count("select count(*) from staff where id=? and archived_name is null", id) == 1, "현재 임원을 선택해 주세요.");
        var existing = d.rows("select username,password_hash from staff_login where staff_id=?", id);
        String username = Objects.toString(f.getFirst("username"),
            existing.isEmpty() ? "staff" + id : existing.get(0).get("username").toString()).strip();
        d.check(username.matches("[A-Za-z0-9_.-]{1,50}") && !username.equalsIgnoreCase("hanultari"),
            "아이디는 영문, 숫자, 점, 밑줄, 하이픈으로 입력해 주세요. 대표 아이디는 사용할 수 없습니다.");
        d.check(d.count("select count(*) from staff_login where lower(username)=lower(?) and staff_id<>?", username, id)==0,
            "다른 임원이 사용 중인 아이디입니다.");
        String password = Objects.toString(f.getFirst("password"), "");
        String hash;
        if (password.isEmpty() && !existing.isEmpty()) {
          hash = existing.get(0).get("password_hash").toString();
        } else {
          d.check(password.length() >= 8 && password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 72,
              "비밀번호는 8자 이상, UTF-8 72바이트 이하로 입력해 주세요.");
          hash = "{bcrypt}" + new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(password);
        }
        d.database().update("merge into staff_login(staff_id,username,password_hash,session_key) key(staff_id) values(?,?,?,random_uuid())",
            id, username, hash);
        d.audit("임원 계정 설정 · " + username);
        return;
      }
      case "staff" -> {
        String phone = Objects.toString(f.getFirst("phone"), "").replace("-", "").strip();
        d.check(phone.isEmpty() || phone.matches("01[016789][0-9]{7,8}"), "휴대전화 번호를 확인해 주세요.");
        d.database()
            .update(
                "update staff set name=?,phone=? where id=? and archived_name is null", d.field(f, "name", 50), phone, id);
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
