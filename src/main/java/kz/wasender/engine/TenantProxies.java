package kz.wasender.engine;

import org.springframework.aop.TargetSource;
import org.springframework.aop.framework.AopInfrastructureBean;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.FactoryBean;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.config.RuntimeBeanReference;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.context.EnvironmentAware;
import org.springframework.context.ResourceLoaderAware;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

@Component
public class TenantProxies implements BeanDefinitionRegistryPostProcessor, EnvironmentAware, ResourceLoaderAware {
    private Environment environment;
    private ResourceLoader resources;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void setResourceLoader(ResourceLoader resources) {
        this.resources = resources;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        EngineComponents.classes(registry, environment, resources).forEach((name, type) -> {
            var definition = new RootBeanDefinition(TenantBean.class);
            definition.getConstructorArgumentValues().addIndexedArgumentValue(0, type);
            definition.getConstructorArgumentValues().addIndexedArgumentValue(1, new RuntimeBeanReference(EngineRegistry.class));
            definition.setAttribute(FactoryBean.OBJECT_TYPE_ATTRIBUTE, type);
            registry.registerBeanDefinition(name, definition);
        });
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
    }

    static final class TenantBean<T> implements FactoryBean<T> {
        private final Class<T> type;
        private final EngineRegistry engines;

        TenantBean(Class<T> type, EngineRegistry engines) {
            this.type = type;
            this.engines = engines;
        }

        @Override
        public T getObject() {
            var factory = new ProxyFactory();
            factory.setProxyTargetClass(true);
            factory.setTargetSource(new CurrentEngineTarget(type, engines));
            factory.addInterface(AopInfrastructureBean.class);
            return type.cast(factory.getProxy(type.getClassLoader()));
        }

        @Override
        public Class<T> getObjectType() {
            return type;
        }
    }

    record CurrentEngineTarget(Class<?> type, EngineRegistry engines) implements TargetSource {
        @Override
        public Class<?> getTargetClass() {
            return type;
        }

        @Override
        public Object getTarget() {
            return engines.current().bean(type);
        }
    }
}
