package kz.inkar.wasender.web;

import kz.inkar.wasender.group.GroupRecord;
import kz.inkar.wasender.group.GroupRepository;
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
        return groups.findAll().stream().filter(group -> !activeOnly || group.active()).toList();
    }
}
