package kr.ac.dongyang.loan;

import java.time.*;
import java.util.UUID;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * A separate database for the three-strike presentation. Real operating data is never seeded here.
 */
@Component
@Profile("demo")
@Order(1)
class DemoData implements CommandLineRunner {
  final JdbcTemplate db;
  final Clock clock;

  DemoData(JdbcTemplate db, Clock clock) {
    this.db = db;
    this.clock = clock;
  }

  @Override
  @Transactional
  public void run(String... args) {
    if (db.queryForObject(
            "select count(*) from borrower where student_no='20990001'", Integer.class)
        > 0) return;
    var today = LocalDate.now(clock);
    db.update(
        "update policy set weekdays='1234567',opens='00:00',closes='23:59:59',cutoff='23:59:59'");
    db.update("insert into borrower values('20990001',2,false)");
    for (int days = 3; days >= 1; days--) {
      var issued = today.minusDays(days).atTime(12, 0);
      var due = issued.plusHours(5);
      boolean returned = days != 1;
      String token = UUID.randomUUID().toString();
      db.update(
          """
insert into application(token,student_no,name,phone,faculty,department,item_id,created,state)
values(?,'20990001','시연학생','01000000000','컴퓨터공학부','웹응용소프트웨어공학과',1,?,'APPROVED')
""",
          token,
          issued.minusMinutes(5));
      long request =
          db.queryForObject("select id from application where token=?", Long.class, token);
      db.update(
          """
insert into loan(request_id,staff_id,issued,due,returned,late,deposit_received,card_received,deposit_back,card_back,memo)
values(?,1,?,?,?,?,true,true,?,?,'발표용 가상 기록')
""",
          request,
          issued,
          due,
          returned ? due.plusMinutes(10) : null,
          returned,
          returned,
          returned);
      long loan = db.queryForObject("select id from loan where request_id=?", Long.class, request);
      long unit = db.queryForObject("select min(id) from unit where item_id=1", Long.class);
      db.update("insert into allocation values(?,?)", loan, unit);
      if (!returned) db.update("update unit set state='OUT' where id=?", unit);
    }
  }
}
