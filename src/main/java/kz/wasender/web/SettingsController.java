package kz.wasender.web;

import kz.wasender.settings.SettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Настройки рассылки и автоответчика со страницы «Настройки». */
@RestController
@RequestMapping("/api/admin/settings")
public class SettingsController {

    private final SettingsService settings;

    public SettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    public SettingsService.View get() {
        return settings.view();
    }

    /** Меняет только переданные поля. */
    @PutMapping
    public SettingsService.View update(@RequestBody SettingsService.View changes) {
        return settings.update(changes);
    }

    @ExceptionHandler(SettingsService.InvalidSettingException.class)
    ResponseEntity<?> invalid(RuntimeException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }
}
