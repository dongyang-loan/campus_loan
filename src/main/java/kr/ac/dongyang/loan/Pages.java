package kr.ac.dongyang.loan;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
class Pages {
  @GetMapping({"/", "/admin", "/login"})
  String page(HttpServletRequest request, Model model) {
    CsrfToken csrf = (CsrfToken) request.getAttribute("_csrf");
    model.addAttribute("token", csrf.getToken());
    model.addAttribute("master", request.isUserInRole("MASTER"));
    model.addAttribute("loginError", request.getParameter("error") != null);
    return switch (request.getRequestURI()) {
      case "/admin" -> "admin";
      case "/login" -> "login";
      default -> "student";
    };
  }
}
