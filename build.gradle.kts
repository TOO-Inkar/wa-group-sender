plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "kz"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

extra["flyway.version"] = "13.8.0"
extra["h2.version"] = "2.5.252"

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.flywaydb:flyway-core")
    runtimeOnly("com.h2database:h2")

    implementation("com.github.auties00:cobalt:0.0.10") {
        exclude(group = "com.aspose", module = "aspose-words")
        exclude(group = "org.slf4j", module = "slf4j-nop")
    }
    implementation("com.google.zxing:core:3.5.4")
    implementation("com.google.zxing:javase:3.5.4")

    implementation("com.google.apis:google-api-services-sheets:v4-rev20260610-2.0.0")
    implementation("com.google.api-client:google-api-client:2.9.1")
    implementation("com.google.auth:google-auth-library-oauth2-http:1.53.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.test {
    useJUnitPlatform {
        excludeTags("spike")
    }
    systemProperty("user.timezone", "Asia/Almaty")
    jvmArgs("-Dfile.encoding=UTF-8")
}

tasks.register<Test>("spike") {
    description = "Runs the Cobalt connectivity spike against the real WhatsApp Web endpoint"
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform {
        includeTags("spike")
    }
    outputs.upToDateWhen { false }
    testLogging {
        showStandardStreams = true
    }
}

tasks.bootJar {
    archiveFileName = "app.jar"
}

tasks.jar {
    enabled = false
}
