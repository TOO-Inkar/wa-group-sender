package kz.wasender.web;

import kz.wasender.group.GroupRecord;
import kz.wasender.group.GroupRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class GroupController {
    private final GroupRepository groups;

    public GroupController(GroupRepository groups) {
        this.groups = groups;
    }

    @GetMapping("/api/groups")
    public List<GroupRecord> groups(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return groups.findPresent().stream().filter(group -> !activeOnly || group.active()).toList();
    }
}
