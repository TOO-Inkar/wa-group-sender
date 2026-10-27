package kz.wasender.engine;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Optional;

@Configuration(proxyBeanMethods = false)
public class TenancyConfig {
    @Bean
    @ConditionalOnMissingBean(NetworkProxies.class)
    NetworkProxies networkProxies() {
        return tenantId -> Optional.empty();
    }
}
