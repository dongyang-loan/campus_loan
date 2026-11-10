package kr.ac.dongyang.loan;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
class DutyEvents {
  private final DutyService duty;
  private final Map<SseEmitter, Subscriber> subscribers = new ConcurrentHashMap<>();

  private static class Subscriber {
    Map<String, Object> lastSnapshot;
    Instant lastSent = Instant.MIN;
  }

  DutyEvents(DutyService duty) {
    this.duty = duty;
  }

  @GetMapping(value = "/api/duty/events", produces = "text/event-stream")
  SseEmitter subscribe() {
    var stream = new SseEmitter(120000L);
    stream.onCompletion(() -> subscribers.remove(stream));
    stream.onTimeout(stream::complete);
    stream.onError(error -> subscribers.remove(stream));
    subscribers.put(stream, new Subscriber());
    return stream;
  }

  // A single polling task reads the shared sheet, then publishes snapshots in order.
  @Scheduled(fixedDelay = 1000)
  void publish() {
    if (subscribers.isEmpty()) return;
    var snapshot = duty.today();
    var now = Instant.now();
    subscribers.forEach(
        (stream, subscriber) -> {
          if (snapshot.equals(subscriber.lastSnapshot)
              && now.isBefore(subscriber.lastSent.plusSeconds(20))) return;
          try {
            stream.send(SseEmitter.event().reconnectTime(1000).data(snapshot));
            subscriber.lastSnapshot = snapshot;
            subscriber.lastSent = now;
          } catch (IOException | IllegalStateException ex) {
            subscribers.remove(stream);
            stream.complete();
          }
        });
  }
}
