package kz.wasender.request;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.random.RandomGenerator;

@Component
public class RequestIdGenerator {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyMMdd");
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final RequestRepository requests;
    private final RandomGenerator random;
    private final Clock clock;

    public RequestIdGenerator(RequestRepository requests, RandomGenerator random, Clock clock) {
        this.requests = requests;
        this.random = random;
        this.clock = clock;
    }

    public String next() {
        while (true) {
            var builder = new StringBuilder("R").append(DAY.format(LocalDate.now(clock))).append('-');
            for (var i = 0; i < 5; i++) {
                builder.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }
            var id = builder.toString();
            if (!requests.exists(id)) {
                return id;
            }
        }
    }
}
