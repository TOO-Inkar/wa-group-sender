package kz.inkar.wasender.notify;

import kz.inkar.wasender.config.NotifyProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class EmailNotifier implements Notifier {

    private final NotifyProperties.Email properties;
    private final ObjectProvider<JavaMailSender> mailSender;

    public EmailNotifier(NotifyProperties properties, ObjectProvider<JavaMailSender> mailSender) {
        this.properties = properties.email();
        this.mailSender = mailSender;
    }

    @Override
    public String channel() {
        return "email";
    }

    @Override
    public boolean configured() {
        return mailSender.getIfAvailable() != null && hasText(properties.to()) && hasText(properties.from());
    }

    @Override
    public void send(String text) {
        var message = new SimpleMailMessage();
        message.setFrom(properties.from());
        message.setTo(properties.to().split("\\s*,\\s*"));
        message.setSubject(properties.subject());
        message.setText(text);
        mailSender.getObject().send(message);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
