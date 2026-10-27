package kz.wasender.engine;

public class EngineUnavailableException extends IllegalStateException {
    public EngineUnavailableException(String message) {
        super(message);
    }
}
