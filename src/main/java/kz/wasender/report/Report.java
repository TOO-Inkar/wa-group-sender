package kz.wasender.report;

import java.time.LocalDateTime;
import java.util.List;

/**
 * A dispatch report for the customer: one request or every request queued in a period. Wording only, no group JIDs
 * or raw protocol errors, so it can be sent as is.
 */
public record Report(
        String title,
        String scope,
        LocalDateTime generatedAt,
        Summary summary,
        List<RequestRow> requests,
        List<DeliveryRow> deliveries,
        List<GroupRow> groups,
        String message) {

    public boolean single() {
        return message != null;
    }

    public record Summary(int requests, int deliveries, int sent, int failed, int skipped, int pending, int groupsReached) {

        /** Share of finished sends that went out, in percent; null while nothing has finished. */
        public Double successRate() {
            var finished = sent + failed + skipped;
            return finished == 0 ? null : 100.0 * sent / finished;
        }
    }

    public record RequestRow(String id, LocalDateTime created, LocalDateTime completed, String status, String target,
                             int sent, int failed, int skipped, int total, String title) {
    }

    public record DeliveryRow(String requestId, String group, LocalDateTime time, String status, String reason) {

        public boolean problem() {
            return reason != null;
        }
    }

    public record GroupRow(String group, int received, int failed) {
    }
}
