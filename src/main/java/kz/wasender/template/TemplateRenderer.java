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

    private final MessageProperties properties;
    private final SheetsProperties.Columns columns;

    public TemplateRenderer(MessageProperties properties, SheetsProperties sheets) {
        this.properties = properties;
        this.columns = sheets.columns();
    }

    public String render(SheetRow row) {
        var values = values(row);
        var lines = new ArrayList<String>();
        for (var line : load().replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) {
            lines.addAll(expand(line, values));
        }
        var result = collapseBlankLines(lines);
        if (properties.numbering() && !result.isEmpty()) {
            var id = row.get(SheetField.ID);
            if (id.matches("\\d+")) {
                result.set(0, keycaps(id) + " " + result.getFirst());
            }
        }
        return String.join("\n", result);
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

    private Map<String, List<String>> values(SheetRow row) {
        var values = new HashMap<String, List<String>>();
        for (var field : SheetField.CONTENT) {
            var lines = lines(row.get(field));
            values.put(normalize(field.title()), lines);
            values.put(normalize(columns.header(field)), lines);
        }
        values.put(normalize(CONTACT), lines(properties.contact()));
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
