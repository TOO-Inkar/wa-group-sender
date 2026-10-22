package kz.wasender.web;

import kz.wasender.campaign.CampaignService;
import kz.wasender.request.RequestIntake;
import kz.wasender.settings.SettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiErrors {

    @ExceptionHandler({RequestIntake.RejectedException.class, SettingsService.InvalidSettingException.class, IllegalArgumentException.class})
    ResponseEntity<Map<String, String>> badRequest(RuntimeException e) {
        return body(HttpStatus.BAD_REQUEST, e);
    }

    @ExceptionHandler(CampaignService.NotFoundException.class)
    ResponseEntity<Map<String, String>> notFound(RuntimeException e) {
        return body(HttpStatus.NOT_FOUND, e);
    }

    @ExceptionHandler(CampaignService.ConflictException.class)
    ResponseEntity<Map<String, String>> conflict(RuntimeException e) {
        return body(HttpStatus.CONFLICT, e);
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, RuntimeException e) {
        return ResponseEntity.status(status).body(Map.of("message", e.getMessage()));
    }
}
