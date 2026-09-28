package kz.wasender.template;

import kz.wasender.config.TemplateProperties;
import kz.wasender.sheets.SheetField;
import kz.wasender.sheets.SheetRow;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class TemplateRenderer {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([\\p{L}\\p{N}_]+)\\s*}}");
    private static final Map<String, SheetField> KEYS = Map.ofEntries(
            Map.entry("id", SheetField.ID),
            Map.entry("route", SheetField.ROUTE),
            Map.entry("tonnage", SheetField.TONNAGE),
            Map.entry("cargo", SheetField.CARGO),
            Map.entry("date", SheetField.DATE),
            Map.entry("freight", SheetField.FREIGHT),
            Map.entry("маршрут", SheetField.ROUTE),
            Map.entry("тоннаж", SheetField.TONNAGE),
            Map.entry("груз", SheetField.CARGO),
            Map.entry("дата", SheetField.DATE),
            Map.entry("фрахт", SheetField.FREIGHT));

    private final TemplateProperties properties;

    public TemplateRenderer(TemplateProperties properties) {
        this.properties = properties;
    }

    public String render(SheetRow row) {
        var matcher = PLACEHOLDER.matcher(load());
        var result = new StringBuilder();
        while (matcher.find()) {
            var field = KEYS.get(matcher.group(1).toLowerCase(Locale.ROOT));
            var value = field == null ? matcher.group() : row.get(field);
            matcher.appendReplacement(result, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(result);
        return result.toString().strip();
    }

    private String load() {
        try {
            if (properties.path() != null && Files.isRegularFile(properties.path())) {
                return Files.readString(properties.path(), StandardCharsets.UTF_8);
            }
            return new ClassPathResource("templates/message.txt").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read template " + properties.path(), e);
        }
    }
}
