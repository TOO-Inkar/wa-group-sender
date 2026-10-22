package kz.wasender.settings;

import kz.wasender.config.AutoReplyProperties;
import kz.wasender.config.DispatchProperties;
import kz.wasender.config.WarmupProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Настройки, которые меняются из админки без перезапуска: рабочее окно, лимиты, паузы, автоответчик.
 * Значение из базы перекрывает значение из .env; удалённое из базы снова берётся из .env.
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    public static final String DEFAULT_AUTOREPLY_TEXT = """
            Здравствуйте! Это автоматический номер для рассылки заявок на грузоперевозки — \
            сообщения и звонки на него никто не читает и не принимает.

            Чтобы обсудить заявку, свяжитесь с диспетчером по контакту, указанному в самой заявке.
            Спасибо!""";

    private final DispatchProperties dispatch;
    private final WarmupProperties warmup;
    private final AutoReplyProperties autoReply;
    private final JdbcClient jdbc;
    private final Clock clock;
    private final Map<Setting, String> overrides = new ConcurrentHashMap<>();
    private volatile boolean loaded;

    public SettingsService(DispatchProperties dispatch, WarmupProperties warmup, AutoReplyProperties autoReply, JdbcClient jdbc, Clock clock) {
        this.dispatch = dispatch;
        this.warmup = warmup;
        this.autoReply = autoReply;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Параметры рассылки с учётом правок из админки. */
    public DispatchProperties dispatch() {
        var d = dispatch;
        return new DispatchProperties(d.autostart(),
                integer(Setting.WAVE_SIZE, d.waveSize()),
                duration(Setting.WAVE_PAUSE_MIN, d.wavePauseMin()),
                duration(Setting.WAVE_PAUSE_MAX, d.wavePauseMax()),
                duration(Setting.GROUP_PAUSE_MIN, d.groupPauseMin()),
                duration(Setting.GROUP_PAUSE_MAX, d.groupPauseMax()),
                d.typingMin(), d.typingMax(), d.idlePoll(),
                time(Setting.WINDOW_START, d.windowStart()),
                time(Setting.WINDOW_END, d.windowEnd()),
                bool(Setting.WEEKENDS_ENABLED, d.weekendsEnabled()),
                integer(Setting.HOURLY_LIMIT, d.hourlyLimit()),
                duration(Setting.OWN_MESSAGE_GAP, d.ownMessageGap()));
    }

    public WarmupProperties warmup() {
        return new WarmupProperties(bool(Setting.WARMUP_ENABLED, warmup.enabled()), warmup.dailyLimits(),
                integer(Setting.DAILY_LIMIT, warmup.dailyCap()));
    }

    public AutoReplyProperties autoReply() {
        var text = value(Setting.AUTOREPLY_TEXT, autoReply.text());
        return new AutoReplyProperties(bool(Setting.AUTOREPLY_ENABLED, autoReply.enabled()),
                bool(Setting.AUTOREPLY_REJECT_CALLS, autoReply.rejectCalls()),
                duration(Setting.AUTOREPLY_COOLDOWN, autoReply.cooldown()),
                text == null || text.isBlank() ? DEFAULT_AUTOREPLY_TEXT : text);
    }

    /** Действующие значения в виде, удобном странице настроек. */
    public View view() {
        var d = dispatch();
        var w = warmup();
        var a = autoReply();
        return new View(d.windowStart().toString(), d.windowEnd().toString(), d.weekendsEnabled(), d.hourlyLimit(), w.dailyCap(),
                w.enabled(), (int) d.groupPauseMin().toSeconds(), (int) d.groupPauseMax().toSeconds(), d.waveSize(),
                (int) d.wavePauseMin().toMinutes(), (int) d.wavePauseMax().toMinutes(), (int) d.ownMessageGap().toMinutes(),
                a.enabled(), a.rejectCalls(), (int) a.cooldown().toHours(), a.text(), DEFAULT_AUTOREPLY_TEXT);
    }

    /** Сохраняет изменённые поля; null — поле не меняется. Ошибка в любом поле — не сохраняется ничего. */
    public synchronized View update(View changes) {
        var values = new LinkedHashMap<Setting, String>();
        if (changes.windowStart() != null) values.put(Setting.WINDOW_START, parseTime(changes.windowStart(), "начало окна").toString());
        if (changes.windowEnd() != null) values.put(Setting.WINDOW_END, parseTime(changes.windowEnd(), "конец окна").toString());
        if (changes.weekendsEnabled() != null) values.put(Setting.WEEKENDS_ENABLED, changes.weekendsEnabled().toString());
        if (changes.hourlyLimit() != null) values.put(Setting.HOURLY_LIMIT, nonNegative(changes.hourlyLimit(), "лимит в час"));
        if (changes.dailyLimit() != null) values.put(Setting.DAILY_LIMIT, nonNegative(changes.dailyLimit(), "лимит в день"));
        if (changes.warmupEnabled() != null) values.put(Setting.WARMUP_ENABLED, changes.warmupEnabled().toString());
        if (changes.groupPauseMinSeconds() != null) values.put(Setting.GROUP_PAUSE_MIN, seconds(changes.groupPauseMinSeconds(), "пауза между группами"));
        if (changes.groupPauseMaxSeconds() != null) values.put(Setting.GROUP_PAUSE_MAX, seconds(changes.groupPauseMaxSeconds(), "пауза между группами"));
        if (changes.waveSize() != null) {
            if (changes.waveSize() < 1) throw new InvalidSettingException("размер волны — от 1 группы");
            values.put(Setting.WAVE_SIZE, changes.waveSize().toString());
        }
        if (changes.wavePauseMinMinutes() != null) values.put(Setting.WAVE_PAUSE_MIN, minutes(changes.wavePauseMinMinutes(), "пауза между волнами"));
        if (changes.wavePauseMaxMinutes() != null) values.put(Setting.WAVE_PAUSE_MAX, minutes(changes.wavePauseMaxMinutes(), "пауза между волнами"));
        if (changes.ownMessageGapMinutes() != null) values.put(Setting.OWN_MESSAGE_GAP, minutes(changes.ownMessageGapMinutes(), "ожидание после своего сообщения"));
        if (changes.autoReplyEnabled() != null) values.put(Setting.AUTOREPLY_ENABLED, changes.autoReplyEnabled().toString());
        if (changes.autoReplyRejectCalls() != null) values.put(Setting.AUTOREPLY_REJECT_CALLS, changes.autoReplyRejectCalls().toString());
        if (changes.autoReplyCooldownHours() != null) values.put(Setting.AUTOREPLY_COOLDOWN, Duration.ofHours(Math.max(0, changes.autoReplyCooldownHours())).toString());
        if (changes.autoReplyText() != null) {
            if (changes.autoReplyText().length() > 3000) throw new InvalidSettingException("текст автоответа длиннее 3000 символов");
            values.put(Setting.AUTOREPLY_TEXT, changes.autoReplyText().strip());
        }

        var check = new LinkedHashMap<>(snapshot());
        check.putAll(values);
        if (Duration.parse(check.get(Setting.GROUP_PAUSE_MIN)).compareTo(Duration.parse(check.get(Setting.GROUP_PAUSE_MAX))) > 0) {
            throw new InvalidSettingException("пауза между группами: «от» больше «до»");
        }
        if (Duration.parse(check.get(Setting.WAVE_PAUSE_MIN)).compareTo(Duration.parse(check.get(Setting.WAVE_PAUSE_MAX))) > 0) {
            throw new InvalidSettingException("пауза между волнами: «от» больше «до»");
        }

        var now = Instant.now(clock);
        values.forEach((setting, value) -> {
            jdbc.sql("merge into app_setting(name, setting_value, updated_at) key (name) values (?, ?, ?)")
                    .params(setting.name(), value, now).update();
            overrides.put(setting, value);
        });
        log.info("SETTINGS updated {}", values.keySet());
        return view();
    }

    /** Все значения строками, как они хранятся; для проверки пар «от–до». */
    private Map<Setting, String> snapshot() {
        var d = dispatch();
        return Map.of(Setting.GROUP_PAUSE_MIN, d.groupPauseMin().toString(), Setting.GROUP_PAUSE_MAX, d.groupPauseMax().toString(),
                Setting.WAVE_PAUSE_MIN, d.wavePauseMin().toString(), Setting.WAVE_PAUSE_MAX, d.wavePauseMax().toString());
    }

    private String value(Setting setting, String fallback) {
        load();
        return overrides.getOrDefault(setting, fallback);
    }

    private int integer(Setting setting, int fallback) {
        var value = value(setting, null);
        try {
            return value == null ? fallback : Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private boolean bool(Setting setting, boolean fallback) {
        var value = value(setting, null);
        return value == null ? fallback : Boolean.parseBoolean(value);
    }

    private Duration duration(Setting setting, Duration fallback) {
        var value = value(setting, null);
        try {
            return value == null ? fallback : Duration.parse(value);
        } catch (DateTimeParseException e) {
            return fallback;
        }
    }

    private LocalTime time(Setting setting, LocalTime fallback) {
        var value = value(setting, null);
        try {
            return value == null ? fallback : LocalTime.parse(value);
        } catch (DateTimeParseException e) {
            return fallback;
        }
    }

    private void load() {
        if (loaded) {
            return;
        }
        synchronized (this) {
            if (loaded) {
                return;
            }
            jdbc.sql("select name, setting_value from app_setting").query((rs, n) -> Map.entry(rs.getString(1), rs.getString(2))).list()
                    .forEach(entry -> {
                        try {
                            overrides.put(Setting.valueOf(entry.getKey()), entry.getValue());
                        } catch (IllegalArgumentException ignored) {
                            // настройка из более новой версии
                        }
                    });
            loaded = true;
        }
    }

    private static LocalTime parseTime(String value, String what) {
        try {
            return LocalTime.parse(value.strip());
        } catch (DateTimeParseException e) {
            throw new InvalidSettingException(what + ": время в виде ЧЧ:ММ, например 08:00");
        }
    }

    private static String nonNegative(int value, String what) {
        if (value < 0) throw new InvalidSettingException(what + " не может быть меньше 0");
        return Integer.toString(value);
    }

    private static String seconds(int value, String what) {
        if (value < 0) throw new InvalidSettingException(what + " не может быть меньше 0");
        return Duration.ofSeconds(value).toString();
    }

    private static String minutes(int value, String what) {
        if (value < 0) throw new InvalidSettingException(what + " не может быть меньше 0");
        return Duration.ofMinutes(value).toString();
    }

    enum Setting {
        WINDOW_START, WINDOW_END, WEEKENDS_ENABLED, HOURLY_LIMIT, DAILY_LIMIT, WARMUP_ENABLED,
        GROUP_PAUSE_MIN, GROUP_PAUSE_MAX, WAVE_SIZE, WAVE_PAUSE_MIN, WAVE_PAUSE_MAX, OWN_MESSAGE_GAP,
        AUTOREPLY_ENABLED, AUTOREPLY_REJECT_CALLS, AUTOREPLY_COOLDOWN, AUTOREPLY_TEXT
    }

    /** Поля страницы настроек. В запросе на изменение null — оставить как есть. */
    public record View(String windowStart, String windowEnd, Boolean weekendsEnabled, Integer hourlyLimit, Integer dailyLimit,
                       Boolean warmupEnabled, Integer groupPauseMinSeconds, Integer groupPauseMaxSeconds, Integer waveSize,
                       Integer wavePauseMinMinutes, Integer wavePauseMaxMinutes, Integer ownMessageGapMinutes,
                       Boolean autoReplyEnabled, Boolean autoReplyRejectCalls, Integer autoReplyCooldownHours, String autoReplyText,
                       String defaultAutoReplyText) {
    }

    public static class InvalidSettingException extends RuntimeException {

        public InvalidSettingException(String message) {
            super(message);
        }
    }
}
