# 빌려드립니다

동양미래대학교 한울타리 총학생회 물품 대여 웹서비스. 노트북에서 실행하는 Spring Boot 한 개에 학생 휴대폰과 관리자 PC가 접속합니다. 대여 데이터는 노트북의 H2 파일 DB에 저장됩니다.

## IntelliJ에서 시작하기

1. 소스 ZIP을 풀고 IntelliJ IDEA의 **Open**으로 `settings.gradle`이 있는 `campus-loan` 폴더를 엽니다.
2. Project SDK와 Gradle JVM을 **JDK 17**로 지정합니다. Gradle 배포판은 프로젝트에 포함된 Wrapper를 선택합니다. 최초 의존성 다운로드에는 인터넷이 필요합니다.
3. `CampusApplication.main()`을 실행합니다. 또는 Windows PowerShell에서 아래 명령을 실행합니다.

```powershell
.\gradlew.bat bootRun
```

4. 학생은 [홈](http://localhost:8080/), 관리자는 [관리자 화면](http://localhost:8080/admin)에 접속합니다. 대표 아이디는 `hanultari`, 기본 비밀번호는 `5826`입니다. 실행 환경에 `ADMIN_PASSWORD`를 지정하면 해당 값이 우선합니다.
5. 관리자 **임원 연락처 → 수정**에서 당직자의 실제 휴대전화 번호를 입력합니다. **계정 설정**에서 개인 비밀번호를 저장하면 해당 임원은 표시된 `staff번호` 아이디로 로그인할 수 있습니다. 작업 이력에는 실제 로그인 아이디가 남습니다.

## 수업에서 바로 시연하기

별도 제공한 `campus-loan-1.0.0.jar`가 있는 폴더에서 아래 명령을 실행합니다. 완성 JAR에는 프런트엔드, Chart.js, H2와 내장 Tomcat이 포함되어 있습니다.

```powershell
java -jar campus-loan-1.0.0.jar --spring.profiles.active=demo
```

IntelliJ에서는 실행 구성의 **Active profiles**에 `demo`를 지정하거나 Program arguments에 `--spring.profiles.active=demo`를 입력합니다. 기본 DB는 `data/campus.mv.db`, 발표용 DB는 `data/campus-demo.mv.db`입니다. 같은 데이터로 다시 열려면 실행 작업 디렉터리를 유지하세요.

- **기본 모드**는 월~금 09:00~17:00으로 시작합니다. 초기 고유번호와 수량은 시연값이며 관리자 화면에서 변경할 수 있습니다.
- **demo 모드**는 매일 운영하고, 가상 학번 `20990001`에 과거 지각 2회와 기한이 지난 대여 1건을 넣습니다. 이 대여를 반납하면 세 번째 지각과 자동 제한을 시연할 수 있습니다. 최초 생성 시에만 시연 기록을 추가합니다.
- 기획서의 미정 정책은 우산의 달력상 다음 날 반납, 같은 신청의 고유번호 일괄 반납, 학생은 품목만 선택하는 것으로 적용했습니다. 관리자에서 운영 종료 시각을 바꿔도 승인된 대여의 기한은 보존됩니다.

## 휴대폰과 PC 연결

노트북에서 `ipconfig`를 실행하고 현재 Wi-Fi 어댑터의 IPv4 주소를 확인합니다. 예를 들어 주소가 `192.168.0.10`이면 같은 Wi-Fi의 휴대폰에서 `http://192.168.0.10:8080/`을 엽니다. PC는 `http://localhost:8080/admin`을 사용합니다. Windows 방화벽은 해당 사설 네트워크에서 Java의 수신 연결을 허용해야 합니다. 학교 Wi-Fi에 기기 격리가 설정되어 있으면 같은 개인 핫스팟에서 시연할 수 있습니다.

열려 있는 관리자 대시보드·신청 목록·반납 화면은 약 3초마다, 학생 재고는 약 4초마다 갱신합니다. 관리자가 입력 중인 폼은 자동 갱신을 멈춰 선택값을 보호합니다.

## 월별 Google Sheets 당직표

공유해 주신 [총학생회 당직표](https://docs.google.com/spreadsheets/d/1PTmj7Gvsnxh-xWz9JVQ3Nc8DhRFdIdUTEVcJSpCTx80/edit)를 기본값으로 설정했습니다.

- 서울 날짜의 월로 탭 이름을 정합니다. 11월 30일은 `11월`, 12월 1일은 `12월`입니다. 다음 달 탭도 기존 달력 양식으로 만들어 두세요.
- 달력 제목의 연월을 확인한 뒤 B~H열 중 오늘 요일에 해당하는 날짜를 찾습니다. 날짜 바로 아래 두 셀의 이름을 임원 DB와 대조합니다. 오른쪽 집계표와 시험 기간 메모는 연락처가 되지 않습니다.
- 공개 열람이 가능한 기존 시트는 Google 시각화 조회의 CSV 응답을 사용합니다. 별도 키 없이 실행됩니다. 학생 홈·연락 화면이 열려 있으면 서버가 약 1초 간격으로 변경을 확인하고 SSE로 전송하며 날짜가 바뀌면 즉시 새 월을 확인합니다. 시트 오류 시 이전 날짜의 번호를 제공하지 않습니다.
- 비공개 시트는 Google Cloud 프로젝트에서 **Google Sheets API**를 사용 설정하고, 서비스 계정의 이메일에 해당 문서 **뷰어** 권한을 줍니다. IntelliJ 실행 환경에 `GOOGLE_APPLICATION_CREDENTIALS`를 서비스 계정 JSON의 절대경로로 설정하면 **Sheets API v4**를 읽기 전용으로 사용합니다. 다른 문서에는 `SHEETS_ID`로 스프레드시트 ID를 지정합니다. 키 파일은 프로젝트 밖에 보관합니다.
- 원본 시트에는 전화번호가 없습니다. 임원 DB에서 이름과 번호를 등록한 뒤 학생 연락 화면을 다시 열면 `당직자 A 전화`, `당직자 B 전화` 링크가 표시됩니다. 학생 화면의 링크는 `tel:`을 사용하며 실제 전화 발신 확인은 휴대폰에서 진행합니다.
- 임원 이름은 연간 당직표에 나온 이름으로 초기화했습니다. 담당자 선택은 18명 전체를 대상으로 하며, 실제 현직 명단과 다르면 관리자에서 이름을 수정합니다.

## 검증과 빌드

```powershell
.\gradlew.bat test bootJar
```

JAR는 `build/libs`, 통합 테스트 결과는 `build/reports/tests/test/index.html`에서 확인합니다. 동시 승인 경쟁, 잘못된 고유번호의 전체 롤백, 신청 재시도, 재고 차감·복구, 기한 보존, 지각과 정지 해제, 운영 차단, 월별 달력 판독을 시험합니다.

## 프로젝트 구조

| 위치 | 역할 |
|---|---|
| `src/main/resources/schema.sql` | H2 테이블, 외래키, 고유 키 |
| `CampusApplication / Setup / Pages` | 실행, 계정 인증, 초기 데이터, Mustache 페이지 |
| `Desk / RentalRequest` | 트랜잭션, JPA 신청 엔티티·저장소, SQL 재고 갱신 |
| `AdminService / Api` | 관리자 조회와 변경, 학생·관리자 HTTP API |
| `DutyService / Catalog` | 월별 당직표, 학부별 학과 목록 |
| `templates / static` | 모바일 학생 화면, PC 관리자 화면, Figma 로고·아이콘 |
| `DemoData / WorkflowTest` | 발표용 DB 초기화, 자동 통합 테스트 |

학부·학과는 대학 공개 목록과 재학생을 위한 변경 전 명칭을 포함합니다. [동양미래대학교 학부·학과](https://www.dongyang.ac.kr/dongyang/index.do)

화면 원본은 [빌려드립니다 Figma](https://www.figma.com/design/U1mpPhUMA6jHK16Lz607kM/)입니다. 개발 모드에서 확인한 모바일 로고, 아이콘, 물품 목록, 메뉴, 상세 화면 및 신청 흐름을 반영했습니다. 배너에는 운영 상태를 표시하며 데스크톱은 동일한 색상과 콘텐츠를 두 열로 배치합니다.

