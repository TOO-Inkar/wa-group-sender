package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties("app.template")
public record TemplateProperties(Path path) {
}
