package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties("app.message")
public record MessageProperties(Path templatePath, String contact, boolean numbering) {
}
