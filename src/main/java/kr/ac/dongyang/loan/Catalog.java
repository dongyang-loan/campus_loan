package kr.ac.dongyang.loan;

import java.util.*;

class Catalog {
  static final Map<String, List<String>> departments = new LinkedHashMap<>();

  static {
    departments.put("기계공학부", List.of("기계공학과", "기계설계공학과"));
    departments.put("로봇자동화공학부", List.of("로봇소프트웨어과", "자동화공학과"));
    departments.put("전기전자통신공학부", List.of("전기공학과",  "정보통신공학과", "반도체전자공학과", "소방안전관리과"));
    departments.put("컴퓨터공학부", List.of("웹응용소프트웨어공학과", "컴퓨터소프트웨어공학과", "인공지능소프트웨어학과"));
    departments.put(
        "생활환경공학부", List.of("건축과", "실내건축디자인과", "생명화학공학과", "바이오융합공학과", "시각디자인과", "AR·VR콘텐츠디자인과"));
    departments.put("경영학부", List.of("경영학과", "세무회계학과", "유통마케팅학과", "호텔관광학과", "경영정보학과", "빅데이터경영과"));
    departments.put("자유전공학과", List.of("자유전공학과"));
  }
}
