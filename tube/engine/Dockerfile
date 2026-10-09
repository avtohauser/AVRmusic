# The avrtube engine: a jar built by CI (gradle :engine:shadowJar) on a small Java runtime.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY build/libs/engine.jar /app/engine.jar
ENV PORT=8090
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/health || exit 1
CMD ["java", "-Xmx384m", "-XX:+UseSerialGC", "-jar", "/app/engine.jar"]
