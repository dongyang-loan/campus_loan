package kr.ac.dongyang.loan;

import java.util.*;
import org.springframework.http.*;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class Api {
  final Desk desk;
  final AdminService admin;
  final DutyService duty;

  Api(Desk desk, AdminService admin, DutyService duty) {
    this.desk = desk;
    this.admin = admin;
    this.duty = duty;
  }

  @GetMapping("/home")
  Object home() {
    return desk.home();
  }

  @GetMapping("/duty")
  Object duty() {
    return duty.today();
  }

  @PostMapping("/requests")
  Object apply(@RequestParam MultiValueMap<String, String> form) {
    return Map.of("id", desk.apply(form));
  }

  @GetMapping("/admin/desk")
  Object desk() {
    return admin.snapshot();
  }

  @PostMapping("/admin/approve/{id}")
  void approve(@PathVariable long id, @RequestParam MultiValueMap<String, String> form) {
    desk.approve(id, form);
  }

  @PostMapping("/admin/return/{id}")
  void finish(@PathVariable long id, @RequestParam MultiValueMap<String, String> form) {
    desk.finish(id, form);
  }

  @GetMapping("/admin/borrowers/{student}/history")
  Object reasons(@PathVariable String student) {
    return admin.reasons(student);
  }

  @PostMapping("/admin/action/{action}")
  void change(@PathVariable String action, @RequestParam MultiValueMap<String, String> form) {
    admin.change(action, form);
  }

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> rule(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode())
        .body(Map.of("message", Objects.toString(e.getReason(), "요청을 확인해 주세요.")));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    java.time.DateTimeException.class,
    NoSuchElementException.class,
    org.springframework.dao.DataAccessException.class
  })
  ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest().body(Map.of("message", "입력값이나 중복된 기록을 확인한 뒤 다시 시도해 주세요."));
  }
}
