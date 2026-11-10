package kr.ac.dongyang.loan;

import com.google.auth.oauth2.ServiceAccountCredentials;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.apache.commons.csv.CSVFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
class DutyService {
  final String sheetId, credentialPath;
  final Desk desk;
  final ObjectMapper json;
  final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(4))
          .followRedirects(HttpClient.Redirect.NORMAL)
          .build();
  com.google.auth.oauth2.GoogleCredentials credentials;
  LocalDate cachedDate;
  Instant expires = Instant.MIN;
  List<String> names = List.of();
  boolean failed;

  DutyService(
      Desk desk,
      ObjectMapper json,
      @Value("${app.sheet-id}") String sheetId,
      @Value("${app.sheet-credentials}") String path) {
    this.desk = desk;
    this.json = json;
    this.sheetId = sheetId;
    this.credentialPath = path;
  }

  static String encode(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
  }

  List<List<String>> fetch(LocalDate today) throws Exception {
    String tab = today.getMonthValue() + "월";
    boolean privateSheet = !credentialPath.isBlank();
    String url =
        privateSheet
            ? "https://sheets.googleapis.com/v4/spreadsheets/"
                + sheetId
                + "/values/"
                + encode("'" + tab + "'!A:H")
            : "https://docs.google.com/spreadsheets/d/"
                + sheetId
                + "/gviz/tq?tqx=out:csv&headers=0&sheet="
                + encode(tab)
                + "&refresh="
                + Instant.now().toEpochMilli();
    var req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(7));
    if (privateSheet) {
      if (credentials == null)
        try (var in = Files.newInputStream(Path.of(credentialPath))) {
          credentials =
              ServiceAccountCredentials.fromStream(in)
                  .createScoped(List.of("https://www.googleapis.com/auth/spreadsheets.readonly"));
        }
      credentials.refreshIfExpired();
      req.header("Authorization", "Bearer " + credentials.getAccessToken().getTokenValue());
    }
    var res =
        client.send(req.GET().build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (res.statusCode() != 200) throw new java.io.IOException("Sheet unavailable");
    List<List<String>> grid = new ArrayList<>();
    if (privateSheet) {
      var values = json.readTree(res.body()).path("values");
      for (var row : values) {
        var cells = new ArrayList<String>();
        for (var cell : row) cells.add(cell.asString());
        grid.add(cells);
      }
    } else
      try (var csv = CSVFormat.DEFAULT.parse(new java.io.StringReader(res.body()))) {
        for (var row : csv) grid.add(row.toList());
      }
    return grid;
  }

  static List<String> parse(List<List<String>> grid, LocalDate day) {
    String title = day.getYear() + "년" + day.getMonthValue() + "월";
    if (grid.isEmpty()
        || grid.stream()
            .limit(4)
            .flatMap(List::stream)
            .noneMatch(x -> x.replaceAll("\\s", "").equals(title)))
      throw new IllegalArgumentException("다른 연월의 달력");
    int col = 1 + day.getDayOfWeek().getValue() % 7;
    for (int i = 2; i < grid.size(); i++) {
      if (!cell(grid, i, col).equals("" + day.getDayOfMonth())) continue;
      Set<String> found = new LinkedHashSet<>();
      for (int offset = 1; offset <= 2; offset++) {
        String value = cell(grid, i + offset, col);
        for (String part : value.split("[,，/·\\n]+")) {
          String person = normalize(part);
          if (!person.isBlank()) found.add(person);
        }
      }
      return List.copyOf(found);
    }
    throw new IllegalArgumentException("날짜 칸 없음");
  }

  static String cell(List<List<String>> grid, int row, int col) {
    return row < grid.size() && col < grid.get(row).size() ? grid.get(row).get(col).strip() : "";
  }

  static String normalize(String name) {
    return java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFKC)
        .replaceAll("[\\s\\p{Z}\\u200B\\uFEFF]+", "");
  }

  synchronized Map<String, Object> today() {
    var date = desk.now().toLocalDate();
    var instant = Instant.now();
    if (!date.equals(cachedDate) || !instant.isBefore(expires)) {
      try {
        names = parse(fetch(date), date);
        failed = false;
      } catch (Exception e) {
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        names = List.of();
        failed = true;
      }
      cachedDate = date;
      expires = Instant.now().plusSeconds(1);
    }
    var contacts = new ArrayList<Map<String, String>>();
    Map<String, String> phones = new HashMap<>();
    for (var person : desk.rows("select name,phone from staff")) {
      phones.put(normalize(person.get("name").toString()), person.get("phone").toString());
    }
    for (String name : names) {
      if (!phones.containsKey(name)
          && name.matches(".*(휴일|휴무|공휴|시험|고사|방학|준비|대체공휴|한글날|개천절|추석|휴강|미운영|어린이날).*")) continue;
      if (name.equals("-") || name.equals("없음")) continue;
      String label = "당직자 " + (char) ('A' + contacts.size());
      contacts.add(Map.of("label", label, "phone", phones.getOrDefault(name, "")));
    }
    return Map.of("date", date.toString(), "failed", failed, "contacts", contacts);
  }
}
