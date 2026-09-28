package kz.wasender.request;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.stream.Stream;

@Component
public class RequestIdGenerator {

    private final RequestRepository requests;

    public RequestIdGenerator(RequestRepository requests) {
        this.requests = requests;
    }

    public String next(Collection<String> idsInSheet) {
        var max = Stream.concat(idsInSheet.stream(), requests.findAllIds().stream())
                .map(String::strip)
                .filter(id -> id.matches("\\d{1,15}"))
                .mapToLong(Long::parseLong)
                .max()
                .orElse(0);
        return Long.toString(max + 1);
    }
}
