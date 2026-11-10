package kr.ac.dongyang.loan;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;

@Entity
@Table(name = "application")
class RentalRequest {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  Long id;

  String token, name, phone, faculty, department, state;

  @Column(name = "student_no")
  String studentNo;

  @Column(name = "item_id")
  Long itemId;

  @Column(name = "consent_at")
  LocalDateTime consentAt;

  LocalDateTime created;
}

interface RequestRepository extends JpaRepository<RentalRequest, Long> {
  java.util.Optional<RentalRequest> findByToken(String token);
}
