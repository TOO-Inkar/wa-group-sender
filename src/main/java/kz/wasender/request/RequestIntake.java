package kz.wasender.request;

import kz.wasender.group.GroupRepository;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import kz.wasender.template.TemplateRenderer;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class RequestIntake {
    private static final int MAX_TEXT = 20_000;

    private final RequestValidator validator;
    private final TemplateRenderer renderer;
    private final GroupRepository groups;

    public RequestIntake(RequestValidator validator, TemplateRenderer renderer, GroupRepository groups) {
        this.validator = validator;
        this.renderer = renderer;
        this.groups = groups;
    }

    public String compose(Draft draft, Collection<String> targetGroups) {
        var rows = validate(draft);
        var unavailable = targetGroups.stream().distinct().filter(jid -> !groups.isSendable(jid)).toList();
        if (!unavailable.isEmpty()) {
            var names = groups.namesByJid();
            throw new RejectedException("в эти группы писать нельзя (пишут только админы или группа исключена из рассылки): "
                    + String.join(", ", unavailable.stream().map(jid -> names.getOrDefault(jid, jid)).toList()));
        }
        return message(draft, rows);
    }

    public String preview(Draft draft) {
        if (draft.isText()) {
            return text(draft.text());
        }
        var rows = rows(draft);
        return rows.isEmpty() ? "" : message(draft, rows);
    }

    private List<SheetRow> validate(Draft draft) {
        if (draft.isText()) {
            if (text(draft.text()).length() > MAX_TEXT) {
                throw new RejectedException("текст длиннее " + MAX_TEXT + " символов");
            }
            return List.of();
        }
        var rows = rows(draft);
        if (rows.isEmpty()) {
            throw new RejectedException("заявка пустая: заполните поля или вставьте готовый текст");
        }
        var problems = new ArrayList<String>();
        for (var i = 0; i < rows.size(); i++) {
            var missing = validator.missingFields(rows.get(i));
            if (!missing.isEmpty()) {
                var fields = String.join(", ", missing.stream().map(SheetField::title).toList());
                problems.add(rows.size() == 1 ? "не заполнено: " + fields : "заявка " + (i + 1) + " — не заполнено: " + fields);
            }
        }
        if (!problems.isEmpty()) {
            throw new RejectedException(String.join("; ", problems));
        }
        return rows;
    }

    private String message(Draft draft, List<SheetRow> rows) {
        if (draft.isText()) {
            return text(draft.text());
        }
        return rows.size() == 1 ? renderer.render(rows.getFirst(), draft.contact()) : renderer.renderCombined(rows, draft.contact());
    }

    private static List<SheetRow> rows(Draft draft) {
        return draft.items().stream().map(RequestIntake::row).filter(row -> !row.isEmpty()).toList();
    }

    private static String text(String text) {
        return text.replace("\r\n", "\n").replace('\r', '\n').strip();
    }

    private static SheetRow row(Map<SheetField, String> fields) {
        var content = new EnumMap<SheetField, String>(SheetField.class);
        fields.forEach((field, value) -> {
            if (field != SheetField.ID && SheetField.CONTENT.contains(field)) {
                content.put(field, value);
            }
        });
        return new SheetRow(0, content);
    }

    public record Draft(List<Map<SheetField, String>> items, String text, String contact) {
        public Draft {
            items = items == null ? List.of() : items;
        }

        public boolean isText() {
            return text != null && !text.isBlank();
        }
    }

    public static class RejectedException extends RuntimeException {
        public RejectedException(String message) {
            super(message);
        }
    }
}
