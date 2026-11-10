package kr.ac.dongyang.loan;

import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.transaction.annotation.Transactional;

@org.springframework.core.annotation.Order(0)
@Configuration
class Setup implements CommandLineRunner {
  final JdbcTemplate db;

  Setup(JdbcTemplate db) {
    this.db = db;
  }

  @Bean
  UserDetailsService users(@Value("${app.admin-password}") String password) {
    var master =
        User.withUsername("hanultari")
            .password("{bcrypt}" + new BCryptPasswordEncoder().encode(password))
            .roles("ADMIN", "MASTER")
            .build();
    return username -> {
      if (master.getUsername().equals(username)) return User.withUserDetails(master).build();
      var hashes =
          db.queryForList(
              "select password_hash from staff_login where username=?", String.class, username);
      if (hashes.isEmpty()) throw new UsernameNotFoundException("등록된 계정이 없습니다.");
      return User.withUsername(username).password(hashes.get(0)).roles("ADMIN").build();
    };
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.authorizeHttpRequests(
            a ->
                a.requestMatchers("/api/admin/action/password")
                    .hasRole("MASTER")
                    .requestMatchers("/admin", "/admin/**", "/api/admin/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .permitAll())
        .formLogin(f -> f.loginPage("/login").defaultSuccessUrl("/admin", true).permitAll())
        .logout(l -> l.logoutSuccessUrl("/login"))
        .build();
  }

  @Override
  @Transactional
  public void run(String... args) {
    if (db.queryForObject("select count(*) from policy", Integer.class) > 0) return;
    db.update("insert into policy values(1,'12345','09:00','17:00','17:00')");
    String[] titles = {
      "축구공", "농구공", "피구공", "우산", "보조배터리 C-type", "보조배터리 8pin", "야구 글러브 + 야구공", "배드민턴 라켓 + 셔틀콕"
    };
    String[] prefix = {"D", "C", "V", "U", "P", "L", "G", "B"};
    int[] counts = {5, 4, 2, 10, 6, 6, 4, 4};
    for (int i = 0; i < titles.length; i++) {
      db.update("insert into item values(?,?,?)", i + 1, titles[i], i == 3);
      for (int n = 1; n <= counts[i]; n++)
        db.update(
            "insert into unit(item_id,code,state) values(?,?,'AVAILABLE')",
            i + 1,
            prefix[i] + "-" + n);
    }
    String[] people =
        "류다영 김신영 김수빈 이승혁 정우석 유세이 정현일 문정윤 박세은 박수호 김미란 김시연 박도연 임호윤 한승윤 최화영 이윤석 김소영".split(" ");
    for (int i = 0; i < people.length; i++)
      db.update("insert into staff values(?,?,?)", i + 1, people[i], "");
  }
}
