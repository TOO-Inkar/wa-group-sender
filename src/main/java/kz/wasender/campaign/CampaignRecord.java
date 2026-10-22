package kz.wasender.campaign;

import java.time.Instant;

/**
 * Заявка из админки. draft — поля формы в JSON для повторного открытия (null — правится готовый текст message);
 * targetLabel — как показать адресатов (название списка или групп), null — все активные группы.
 */
public record CampaignRecord(String id, String title, String draft, String message, boolean targeted, String targetLabel,
                             Schedule schedule, boolean enabled, boolean deleted, Instant createdAt, Instant updatedAt,
                             Instant nextRunAt, Instant lastRunAt) {
}
