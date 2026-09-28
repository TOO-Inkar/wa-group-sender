package kz.wasender.sheets;

import java.util.List;

public class SheetLayoutException extends RuntimeException {

    private final List<String> missing;

    public SheetLayoutException(List<String> missing) {
        super("sheet has no columns: " + String.join(", ", missing));
        this.missing = List.copyOf(missing);
    }

    public List<String> missing() {
        return missing;
    }
}
