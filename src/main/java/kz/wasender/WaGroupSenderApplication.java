package kz.wasender;

import kz.wasender.notify.TelegramBot;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Import;

@SpringBootApplication(scanBasePackages = {"kz.wasender.config", "kz.wasender.web", "kz.wasender.platform", "kz.wasender.engine"})
@ConfigurationPropertiesScan
@Import(TelegramBot.class)
public class WaGroupSenderApplication {
    public static void main(String[] args) {
        SpringApplication.run(WaGroupSenderApplication.class, args);
    }
}
