package kz.wasender.platform;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public class Passwords {
    public static final int MIN_LENGTH = 8;
    private static final int MAX_BYTES = 72;
    private static final Logger log = LoggerFactory.getLogger(Passwords.class);

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public String hash(@Nullable String password) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw new IllegalArgumentException("Пароль должен быть не короче " + MIN_LENGTH + " символов");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new IllegalArgumentException("Пароль слишком длинный: не больше " + MAX_BYTES + " байт");
        }
        return encoder.encode(password);
    }

    public boolean matches(@Nullable String password, String hash) {
        if (password == null) {
            return false;
        }
        try {
            return encoder.matches(password, hash);
        } catch (IllegalArgumentException e) {
            log.error("LOGIN stored password hash is not a bcrypt hash");
            return false;
        }
    }
}
