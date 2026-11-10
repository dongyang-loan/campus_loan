package kr.ac.dongyang.loan;

import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
class ItemCatalog {
  private final Desk desk;

  ItemCatalog(Desk desk) {
    this.desk = desk;
  }

  @GetMapping("/api/items/{id}/photo")
  ResponseEntity<byte[]> photo(@PathVariable long id) {
    var images =
        desk.database()
            .queryForList("select image_bytes from item_photo where item_id=?", byte[].class, id);
    if (images.isEmpty()) return ResponseEntity.notFound().build();
    return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(images.get(0));
  }

  @Transactional
  @PostMapping("/api/admin/catalog")
  public void save(
      @RequestParam long id,
      @RequestParam String title,
      @RequestParam int quantity,
      @RequestParam(defaultValue = "false") boolean nextDay,
      @RequestParam(required = false) MultipartFile photo) {
    title = title.strip();
    desk.check(!title.isBlank() && title.length() <= 80, "물품 이름을 1~80자로 입력해 주세요.");
    desk.check(quantity >= (id == 0 ? 1 : 0) && quantity <= 500, "한 번에 등록할 수 있는 수량은 최대 500개입니다.");
    byte[] image = photo == null || photo.isEmpty() ? null : readPhoto(photo);
    desk.lock();
    var db = desk.database();
    desk.check(
        desk.count(
                "select count(*) from item i where title=? and id<>? and not exists(select 1 from"
                    + " retired_item z where z.item_id=i.id)",
                title,
                id)
            == 0,
        "같은 이름의 물품이 있습니다.");
    if (id == 0) {
      id = db.queryForObject("select coalesce(max(id),0)+1 from item", Long.class);
      db.update("insert into item(id,title,next_day) values(?,?,?)", id, title, nextDay);
    } else {
      desk.check(
          db.update(
                  "update item set title=?,next_day=? where id=? and id not in(select item_id from"
                      + " retired_item)",
                  title,
                  nextDay,
                  id)
              == 1,
          "물품이 없습니다.");
    }
    if (image != null)
      db.update(
          "merge into item_photo(item_id,image_bytes,revision) key(item_id) values(?,?,?)",
          id,
          image,
          UUID.randomUUID().toString());
    int serial = 1;
    for (int n = 0; n < quantity; n++) {
      String code;
      do {
        code = "I" + id + "-" + serial++;
      } while (desk.count("select count(*) from unit where code=?", code) > 0);
      db.update("insert into unit(item_id,code,state) values(?,?,'AVAILABLE')", id, code);
    }
    desk.audit("물품 등록·수정 · " + title + " · 재고 추가 " + quantity + "개");
  }

  private byte[] readPhoto(MultipartFile file) {
    try (var input = ImageIO.createImageInputStream(file.getInputStream())) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw new IOException();
      var reader = readers.next();
      try {
        reader.setInput(input);
        if (!Set.of("JPEG", "PNG").contains(reader.getFormatName().toUpperCase(Locale.ROOT)))
          throw new IOException();
        int w = reader.getWidth(0), h = reader.getHeight(0);
        if ((long) w * h > 50000000L) throw new IOException();
        var params = reader.getDefaultReadParam();
        int sample = Math.max(1, (Math.max(w, h) + 1023) / 1024);
        params.setSourceSubsampling(sample, sample, 0, 0);
        var output = new ByteArrayOutputStream();
        ImageIO.write(reader.read(0, params), "png", output);
        return output.toByteArray();
      } finally {
        reader.dispose();
      }
    } catch (IOException | RuntimeException e) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JPG 또는 PNG 사진을 확인해 주세요.");
    }
  }
}
