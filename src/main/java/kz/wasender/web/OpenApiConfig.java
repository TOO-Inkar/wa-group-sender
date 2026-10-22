package kz.wasender.web;

import io.swagger.v3.oas.models.media.Schema;
import org.jspecify.annotations.Nullable;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.ClassUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Точный контракт для типов фронтенда: каждое поле record-ов API обязательно, а помеченное {@link Nullable}
 * может быть null. Без этого springdoc делает все поля необязательными, и TypeScript не напоминает про null.
 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    @Bean
    OpenApiCustomizer requiredAndNullableFields() {
        var records = records();
        return openApi -> {
            var schemas = openApi.getComponents() == null ? null : openApi.getComponents().getSchemas();
            if (schemas == null) {
                return;
            }
            schemas.forEach((name, schema) -> {
                var type = records.get(name);
                if (type == null || schema.getProperties() == null) {
                    return;
                }
                var required = new ArrayList<String>();
                for (var component : type.getRecordComponents()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Schema<?>> properties = (Map<String, Schema<?>>) (Map<?, ?>) schema.getProperties();
                    var property = properties.get(component.getName());
                    if (property == null) {
                        continue;
                    }
                    required.add(component.getName());
                    if (component.getAnnotatedType().isAnnotationPresent(Nullable.class)) {
                        properties.put(component.getName(), nullable(property));
                    }
                }
                schema.setRequired(required);
            });
        };
    }

    private static Schema<?> nullable(Schema<?> property) {
        if (property.get$ref() != null) {
            var none = new Schema<>();
            none.setTypes(java.util.Set.of("null"));
            return new Schema<>().oneOf(List.of(property, none));
        }
        var types = new LinkedHashSet<String>(property.getTypes() == null ? List.of() : property.getTypes());
        if (types.isEmpty() && property.getType() != null) {
            types.add(property.getType());
        }
        types.add("null");
        property.setTypes(types);
        return property;
    }

    /** Все record-ы сервиса по простому имени — так springdoc называет схемы. */
    private static Map<String, Class<?>> records() {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter((reader, factory) -> "java.lang.Record".equals(reader.getClassMetadata().getSuperClassName()));
        var found = new HashMap<String, Class<?>>();
        for (var candidate : scanner.findCandidateComponents("kz.wasender")) {
            var type = ClassUtils.resolveClassName(candidate.getBeanClassName(), OpenApiConfig.class.getClassLoader());
            found.putIfAbsent(type.getSimpleName(), type);
        }
        return found;
    }
}
