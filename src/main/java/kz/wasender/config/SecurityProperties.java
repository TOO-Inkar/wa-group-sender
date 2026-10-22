package kz.wasender.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * @param adminToken   токен для API (заголовок header) и ключ подписи сессий страницы входа
 * @param username     логин страницы входа
 * @param passwordHash bcrypt-хеш пароля страницы входа; пусто — вход только по токену
 * @param sessionTtl   сколько живёт вход в браузере
 */
@ConfigurationProperties("app.security")
public record SecurityProperties(String adminToken, String header, String username, String passwordHash, Duration sessionTtl) {
}
