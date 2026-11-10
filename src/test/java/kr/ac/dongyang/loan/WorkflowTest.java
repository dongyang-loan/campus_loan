package kr.ac.dongyang.loan;

import static org.assertj.core.api.Assertions.*;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.util.*;
import org.springframework.web.server.ResponseStatusException;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WorkflowTest {
  @TestConfiguration
  static class Dates {
    @Bean
    @Primary
    Clock testClock() {
      return Clock.fixed(Instant.parse("2026-11-09T03:00:00Z"), ZoneId.of("Asia/Seoul"));
    }
  }

  Desk desk;
  AdminService admin;
  org.springframework.context.ConfigurableApplicationContext context;

  @BeforeAll
  void start() {
    context =
        new org.springframework.boot.builder.SpringApplicationBuilder(
                CampusApplication.class, Dates.class)
            .run(
                "--spring.datasource.url=jdbc:h2:mem:tests;DB_CLOSE_DELAY=-1",
                "--server.port=0",
                "--app.admin-password=local-test");
    desk = context.getBean(Desk.class);
    admin = context.getBean(AdminService.class);
  }

  @AfterAll
  void stop() {
    context.close();
  }

  @BeforeEach
  void clean() {
    for (String table :
        List.of(
            "retired_item", "audit", "allocation", "loan", "application", "borrower", "closure"))
      desk.database().update("delete from " + table);
    desk.database().update("update unit set state='AVAILABLE'");
    desk.database()
        .update("update policy set weekdays='12345',opens='09:00',closes='17:00',cutoff='17:00'");
  }

  static MultiValueMap<String, String> form(String... pairs) {
    var f = new LinkedMultiValueMap<String, String>();
    for (int i = 0; i < pairs.length; i += 2) f.add(pairs[i], pairs[i + 1]);
    return f;
  }

  MultiValueMap<String, String> student(String no, long item) {
    return form(
        "consent",
        "yes",
        "token",
        UUID.randomUUID().toString(),
        "studentNo",
        no,
        "item",
        "" + item,
        "name",
        "가상학생",
        "faculty",
        "컴퓨터공학부",
        "department",
        "웹응용소프트웨어공학과",
        "phone",
        "01000000000");
  }

  String unit(long item, int n) {
    return "" + desk.rows("select id from unit where item_id=? order by id", item).get(n).get("id");
  }

  MultiValueMap<String, String> approval(String... units) {
    var f = form("staff", "1", "deposit", "on", "card", "on");
    for (String u : units) f.add("units", u);
    return f;
  }

  @Test
  void simultaneousApprovalsHaveOneWinnerAndNoPartialAllocation() throws Exception {
    long a = desk.apply(student("20260001", 7)), b = desk.apply(student("20260002", 7));
    var pool = Executors.newFixedThreadPool(2);
    var start = new CountDownLatch(1);
    try {
      var futures = new ArrayList<Future<Boolean>>();
      for (long id : List.of(a, b))
        futures.add(
            pool.submit(
                () -> {
                  start.await();
                  try {
                    desk.approve(id, approval(unit(7, id == a ? 0 : 1), unit(7, 2)));
                    return true;
                  } catch (ResponseStatusException e) {
                    return false;
                  }
                }));
      start.countDown();
      assertThat(List.of(futures.get(0).get(), futures.get(1).get()))
          .containsExactlyInAnyOrder(true, false);
      assertThat(desk.count("select count(*) from loan")).isEqualTo(1);
      assertThat(desk.count("select count(*) from unit where state='OUT'")).isEqualTo(2);
      assertThat(desk.count("select count(*) from application where state='PENDING'")).isEqualTo(1);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void requestRetryStockDeadlineAndSettlement() {
    var f = student("20260003", 4);
    long id = desk.apply(f);
    assertThat(desk.apply(f)).isEqualTo(id);
    assertThat(desk.count("select count(*) from unit where state='OUT'")).isZero();
    assertThatThrownBy(() -> desk.approve(id, approval(unit(1, 0))))
        .isInstanceOf(ResponseStatusException.class);
    desk.approve(id, approval(unit(4, 0), unit(4, 1)));
    assertThatThrownBy(() -> desk.approve(id, approval(unit(4, 3))))
        .isInstanceOf(ResponseStatusException.class);
    var loan = desk.rows("select id,due from loan").get(0);
    long lid = ((Number) loan.get("id")).longValue();
    desk.database().update("update policy set closes='16:00'");
    assertThat(desk.rows("select due from loan where id=?", lid).get(0).get("due"))
        .isEqualTo("2026-11-10T17:00");
    assertThatThrownBy(() -> desk.finish(lid, form("card", "on")))
        .isInstanceOf(ResponseStatusException.class);
    desk.finish(lid, form("card", "on", "deposit", "on"));
    assertThatThrownBy(() -> desk.finish(lid, form())).isInstanceOf(ResponseStatusException.class);
    assertThat(desk.count("select count(*) from loan where deposit_back and card_back")).isOne();
  }

  @Test
  void thirdLateRestrictsAndManualReleasePersists() {
    String no = "20260004";
    for (int i = 0; i < 3; i++) {
      long req = desk.apply(student(no, 1));
      desk.approve(req, approval(unit(1, 0)));
      long id =
          desk.database().queryForObject("select id from loan where request_id=?", Long.class, req);
      desk.database().update("update loan set due=? where id=?", desk.now().minusMinutes(1), id);
      desk.finish(id, form("card", "on", "deposit", "on"));
    }
    assertThatThrownBy(() -> desk.apply(student(no, 1)))
        .isInstanceOf(ResponseStatusException.class);
    admin.change("restriction", form("id", "0", "studentNo", no, "reason", "시연 해제"));
    assertThat(admin.reasons(no).toString()).contains("시연 해제");
    desk.apply(student(no, 1));
    assertThat(desk.count("select late_count from borrower where student_no=?", no)).isEqualTo(3);
    admin.change("restriction", form("id", "0", "studentNo", no, "reason", "재설정", "suspend", "on"));
    assertThatThrownBy(() -> desk.apply(student(no, 1)))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void consentAndOpenLoanAreCheckedAtApplicationAndApproval() {
    var f = student("20268888", 1);
    f.remove("consent");
    assertThatThrownBy(() -> desk.apply(f)).isInstanceOf(ResponseStatusException.class);
    f.add("consent", "yes");
    long first = desk.apply(f), second = desk.apply(student("20268888", 2));
    desk.approve(first, approval(unit(1, 0)));
    assertThatThrownBy(() -> desk.apply(student("20268888", 3)))
        .isInstanceOf(ResponseStatusException.class);
    assertThatThrownBy(() -> desk.approve(second, approval(unit(2, 0))))
        .isInstanceOf(ResponseStatusException.class);
    long id =
        desk.database().queryForObject("select id from loan where request_id=?", Long.class, first);
    desk.finish(id, form("card", "on", "deposit", "on"));
    desk.approve(second, approval(unit(2, 0)));
  }

  @Test
  void deletedItemKeepsPastLoansAndBlocksStaleRequests() {
    long req = desk.apply(student("20991111", 1));
    var target = form("id", "1");
    assertThatThrownBy(() -> admin.change("delete-item", target))
        .isInstanceOf(ResponseStatusException.class);
    desk.approve(req, approval(unit(1, 0)));
    assertThatThrownBy(() -> admin.change("delete-item", target))
        .isInstanceOf(ResponseStatusException.class);
    long loan =
        desk.database().queryForObject("select id from loan where request_id=?", Long.class, req);
    desk.finish(loan, form("deposit", "on", "card", "on"));
    admin.change("delete-item", target);
    assertThatThrownBy(() -> desk.apply(student("20991112", 1)))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(desk.count("select count(*) from loan where id=?", loan)).isOne();
  }

  @Test
  void eligibilityChecks() {
    var f = student("20260005", 2);
    desk.database().update("update policy set weekdays='2'");
    assertThatThrownBy(() -> desk.apply(f)).isInstanceOf(ResponseStatusException.class);
    desk.database().update("update policy set weekdays='1'");
    desk.database()
        .update("insert into closure(starts,ends,reason) values('2026-11-09','2026-11-10','시험')");
    assertThatThrownBy(() -> desk.apply(f)).isInstanceOf(ResponseStatusException.class);
    desk.database().update("delete from closure");
    desk.database().update("update unit set state='DISABLED' where item_id=2");
    assertThatThrownBy(() -> desk.apply(f)).isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void dutyRefreshUsesReplacementOfficersRegisteredPhone() throws Exception {
    String first = "김시연", replacement = "유세이";
    desk.database().update("update staff set phone='01000000001' where name=?", first);
    desk.database().update("update staff set phone='01000000002' where name=?", replacement);
    String[] assignment = {first};
    var reads = new java.util.concurrent.atomic.AtomicInteger();
    DutyService duty =
        new DutyService(desk, null, "", "") {
          @Override
          List<List<String>> fetch(LocalDate date) {
            reads.incrementAndGet();
            return List.of(
                List.of("2026년 11월"),
                List.of("", "", "월"),
                List.of("", "", "9"),
                List.of("", "", assignment[0]),
                List.of("", "", "정우석"));
          }
        };
    assertThat(duty.today().get("contacts").toString()).contains("01000000001", "당직자 B");
    assignment[0] = " 유 세이 ";
    duty.expires = Instant.MIN;
    var clients = Executors.newFixedThreadPool(8);
    try {
      var gate = new CountDownLatch(1);
      var futures = new ArrayList<Future<String>>();
      for (int i = 0; i < 8; i++)
        futures.add(
            clients.submit(
                () -> {
                  gate.await();
                  return duty.today().get("contacts").toString();
                }));
      gate.countDown();
      for (var future : futures)
        assertThat(future.get()).contains("01000000002").doesNotContain("01000000001");
      assertThat(reads.get()).isEqualTo(2);
    } finally {
      clients.shutdownNow();
    }
    assertThat(duty.today().get("contacts").toString())
        .contains("01000000002", "당직자 B")
        .doesNotContain("01000000001");
  }

  @Test
  void waivedItemNeedsReasonAndOnlyReceivedItemMustBeReturned() {
    long request = desk.apply(student("20260007", 1));
    var approval = approval(unit(1, 0));
    approval.remove("card");
    approval.add("exception", "on");
    assertThatThrownBy(() -> desk.approve(request, approval))
        .isInstanceOf(ResponseStatusException.class);
    approval.add("exceptionReason", "학생회 담당자 확인");
    desk.approve(request, approval);
    long loan =
        desk.database()
            .queryForObject("select id from loan where request_id=?", Long.class, request);
    assertThatThrownBy(() -> desk.finish(loan, form("card", "on")))
        .isInstanceOf(ResponseStatusException.class);
    desk.finish(loan, form("deposit", "on"));
    assertThat(
            desk.count(
                "select count(*) from loan where deposit_back and not card_back and not"
                    + " card_received"))
        .isOne();
  }

  @Test
  void calendarUsesMonthYearAndWeekdayColumn() {
    var grid =
        List.of(
            List.of("", "2026년 11월"),
            List.of("", "", "월"),
            List.of("", "8", "9", "10"),
            List.of("", "", "당직가", "다른날"),
            List.of("", "", "당직나"));
    assertThat(DutyService.parse(grid, LocalDate.of(2026, 11, 9))).containsExactly("당직가", "당직나");
    assertThat(DutyService.parse(grid, LocalDate.of(2026, 11, 8))).isEmpty();
    assertThatThrownBy(() -> DutyService.parse(grid, LocalDate.of(2025, 11, 9)))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
