FROM eclipse-temurin:25.0.4.1_1-jdk-noble AS build
WORKDIR /workspace
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY docs/test-sheet.csv docs/test-sheet.csv
COPY src src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:25.0.4.1_1-jre-alpine
RUN addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app \
    && mkdir -p /app /data/db /data/logs /data/qr /data/templates \
    && chown -R app:app /app /data
WORKDIR /app
COPY --from=build --chown=app:app /workspace/build/libs/app.jar /app/app.jar
ENV TZ=Asia/Almaty \
    JAVA_OPTS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError -Duser.timezone=Asia/Almaty -Dfile.encoding=UTF-8"
USER app
EXPOSE 8080
VOLUME ["/data/db", "/data/logs", "/data/qr"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
