package kz.wasender.web;

import kz.wasender.group.GroupRecord;
import kz.wasender.group.GroupRepository;
import kz.wasender.whatsapp.GroupPictureService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

@RestController
public class GroupController {
    private static final CacheControl PICTURE_CACHE = CacheControl.maxAge(Duration.ofHours(12)).cachePrivate();

    private final GroupRepository groups;
    private final GroupPictureService pictures;

    public GroupController(GroupRepository groups, GroupPictureService pictures) {
        this.groups = groups;
        this.pictures = pictures;
    }

    @GetMapping("/api/groups")
    public List<GroupRecord> groups(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return groups.findPresent().stream().filter(group -> !activeOnly || group.active()).toList();
    }

    @GetMapping("/api/groups/{jid}/picture")
    public ResponseEntity<byte[]> picture(@PathVariable String jid) {
        return pictures.picture(jid)
                .map(jpeg -> ResponseEntity.ok().cacheControl(PICTURE_CACHE).contentType(MediaType.IMAGE_JPEG).body(jpeg))
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(PICTURE_CACHE).build());
    }
}
