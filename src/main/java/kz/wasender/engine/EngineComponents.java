package kz.wasender.engine;

import kz.wasender.notify.TelegramBot;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.context.annotation.AnnotationBeanNameGenerator;
import org.springframework.context.annotation.ClassPathBeanDefinitionScanner;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.util.ClassUtils;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

final class EngineComponents {
    private static final String[] PACKAGES = {
            "kz.wasender.autoreply", "kz.wasender.campaign", "kz.wasender.dispatch", "kz.wasender.group", "kz.wasender.notify",
            "kz.wasender.report", "kz.wasender.request", "kz.wasender.risk", "kz.wasender.settings", "kz.wasender.sheets",
            "kz.wasender.template", "kz.wasender.whatsapp"};

    private EngineComponents() {
    }

    static void scan(BeanDefinitionRegistry registry, Environment environment) {
        excludeRoot(new ClassPathBeanDefinitionScanner(registry, true, environment)).scan(PACKAGES);
    }

    static Map<String, Class<?>> classes(BeanDefinitionRegistry registry, Environment environment, ResourceLoader resources) {
        var provider = excludeRoot(new ClassPathScanningCandidateComponentProvider(true, environment));
        provider.setResourceLoader(resources);
        var result = new LinkedHashMap<String, Class<?>>();
        Arrays.stream(PACKAGES).flatMap(base -> provider.findCandidateComponents(base).stream())
                .forEach(definition -> result.put(name(definition, registry), load(definition, resources)));
        return result;
    }

    private static <T extends ClassPathScanningCandidateComponentProvider> T excludeRoot(T provider) {
        provider.addExcludeFilter(new AssignableTypeFilter(TelegramBot.class));
        return provider;
    }

    private static String name(BeanDefinition definition, BeanDefinitionRegistry registry) {
        return AnnotationBeanNameGenerator.INSTANCE.generateBeanName(definition, registry);
    }

    private static Class<?> load(BeanDefinition definition, ResourceLoader resources) {
        return ClassUtils.resolveClassName(definition.getBeanClassName(), resources.getClassLoader());
    }
}
