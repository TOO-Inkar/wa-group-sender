package kz.wasender.template;

import kz.wasender.config.MessageProperties;
import kz.wasender.config.SheetsProperties;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class TemplateRenderer {

    public static final String CONTACT = "Контакт";

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([^{}\\n]+)}");
    private static final String KEYCAP = "️⃣";
    /** Between requests combined into one message. */
    public static final String SEPARATOR = "━━━━━━━━━━━━━━━━━━━━";

    private final MessageProperties properties;
    private final SheetsProperties.Columns columns;

    public TemplateRenderer(MessageProperties properties, SheetsProperties sheets) {
        this.properties = properties;
        this.columns = sheets.columns();
    }

    public String render(SheetRow row) {
        return render(row, null);
    }

    /** One request; contact null means the configured MESSAGE_CONTACT. */
    public String render(SheetRow row, String contact) {
        var result = renderLines(templateLines(), values(row, contactLines(contact)));
        if (properties.numbering() && !result.isEmpty()) {
            var id = row.get(SheetField.ID);
            if (id.matches("\\d+")) {
                result.set(0, keycaps(id) + " " + result.getFirst());
            }
        }
        return String.join("\n", result);
    }

    /**
     * Several requests in one message: each is numbered by its position (1️⃣, 2️⃣…) and rendered without the
     * contact line, they are separated by {@link #SEPARATOR}, and the contact follows once at the end.
     */
    public String renderCombined(List<SheetRow> rows, String contact) {
        var template = templateLines();
        var parts = new ArrayList<String>();
        for (var i = 0; i < rows.size(); i++) {
            var lines = renderLines(template.stream().filter(line -> !hasContact(line)).toList(), values(rows.get(i), List.of()));
            if (lines.isEmpty()) {
                continue;
            }
            lines.set(0, keycaps(Integer.toString(parts.size() + 1)) + " " + lines.getFirst());
            parts.add(String.join("\n", lines));
        }
        var contactBlock = renderLines(template.stream().filter(TemplateRenderer::hasContact).toList(),
                values(new SheetRow(0, Map.of()), contactLines(contact)));
        var message = String.join("\n\n" + SEPARATOR + "\n\n", parts);
        return contactBlock.isEmpty() ? message : message + "\n\n" + String.join("\n", contactBlock);
    }

    private List<String> templateLines() {
        return List.of(load().replace("\r\n", "\n").replace('\r', '\n').split("\n", -1));
    }

    private List<String> renderLines(List<String> template, Map<String, List<String>> values) {
        var lines = new ArrayList<String>();
        for (var line : template) {
            lines.addAll(expand(line, values));
        }
        return collapseBlankLines(lines);
    }

    private static boolean hasContact(String line) {
        var matcher = PLACEHOLDER.matcher(line);
        while (matcher.find()) {
            if (normalize(matcher.group(1)).equals(normalize(CONTACT))) {
                return true;
            }
        }
        return false;
    }

    private List<String> contactLines(String contact) {
        return lines(contact == null || contact.isBlank() ? properties.contact() : contact);
    }

    private List<String> expand(String line, Map<String, List<String>> values) {
        var matcher = PLACEHOLDER.matcher(line);
        String multiKey = null;
        var found = false;
        while (matcher.find()) {
            var value = values.get(normalize(matcher.group(1)));
            if (value == null) {
                continue;
            }
            found = true;
            if (value.isEmpty()) {
                return List.of();
            }
            if (value.size() > 1 && multiKey == null) {
                multiKey = normalize(matcher.group(1));
            }
        }
        if (!found) {
            return List.of(line);
        }
        if (multiKey == null) {
            return List.of(substitute(line, values, null, null));
        }
        var result = new ArrayList<String>();
        for (var part : values.get(multiKey)) {
            result.add(substitute(line, values, multiKey, part));
        }
        return result;
    }

    private String substitute(String line, Map<String, List<String>> values, String multiKey, String part) {
        var matcher = PLACEHOLDER.matcher(line);
        var builder = new StringBuilder();
        while (matcher.find()) {
            var key = normalize(matcher.group(1));
            var value = values.get(key);
            String replacement;
            if (value == null) {
                replacement = matcher.group();
            } else if (key.equals(multiKey)) {
                replacement = part;
            } else {
                replacement = String.join(" ", value);
            }
            matcher.appendReplacement(builder, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(builder);
        return builder.toString();
    }

    private Map<String, List<String>> values(SheetRow row, List<String> contact) {
        var values = new HashMap<String, List<String>>();
        for (var field : SheetField.CONTENT) {
            var lines = lines(row.get(field));
            values.put(normalize(field.title()), lines);
            values.put(normalize(columns.header(field)), lines);
        }
        values.put(normalize(CONTACT), contact);
        return values;
    }

    private static List<String> lines(String value) {
        if (value == null) {
            return List.of();
        }
        return Arrays.stream(value.split("\\R")).map(String::strip).filter(line -> !line.isEmpty()).toList();
    }

    private static List<String> collapseBlankLines(List<String> lines) {
        var result = new ArrayList<String>();
        for (var line : lines) {
            var blank = line.isBlank();
            if (blank && (result.isEmpty() || result.getLast().isBlank())) {
                continue;
            }
            result.add(blank ? "" : line);
        }
        while (!result.isEmpty() && result.getLast().isBlank()) {
            result.removeLast();
        }
        return result;
    }

    private static String keycaps(String number) {
        var builder = new StringBuilder();
        for (var digit : number.toCharArray()) {
            builder.append(digit).append(KEYCAP);
        }
        return builder.toString();
    }

    private static String normalize(String key) {
        return key.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private String load() {
        try {
            if (properties.templatePath() != null && Files.isRegularFile(properties.templatePath())) {
                return Files.readString(properties.templatePath(), StandardCharsets.UTF_8);
            }
            return new ClassPathResource("templates/message.txt").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read template " + properties.templatePath(), e);
        }
    }
}
