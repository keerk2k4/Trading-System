FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /workspace

# Build shared domain dependency first
COPY domain-engine/pom.xml domain-engine/pom.xml
RUN mvn -f domain-engine/pom.xml dependency:go-offline
COPY domain-engine/src domain-engine/src
RUN mvn -f domain-engine/pom.xml clean install -Dmaven.test.skip=true

# Build spring-boot-app
COPY spring-boot-app/pom.xml spring-boot-app/pom.xml
RUN mvn -f spring-boot-app/pom.xml dependency:go-offline
COPY spring-boot-app/src spring-boot-app/src
RUN mvn -f spring-boot-app/pom.xml clean package -Dmaven.test.skip=true

# Build trade-executor
COPY trade-executor/pom.xml trade-executor/pom.xml
RUN mvn -f trade-executor/pom.xml dependency:go-offline
COPY trade-executor/src trade-executor/src
RUN mvn -f trade-executor/pom.xml clean package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre AS runtime

WORKDIR /app

RUN useradd --system --create-home --uid 10001 appuser

COPY --from=build /workspace/spring-boot-app/target/*.jar spring-boot-app.jar
COPY --from=build /workspace/trade-executor/target/*.jar trade-executor.jar

COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e

APP_KIND_VALUE="${APP_KIND:-spring-boot-app}"

if [ "$APP_KIND_VALUE" = "trade-executor" ]; then
	exec java -jar /app/trade-executor.jar
fi

exec java -jar /app/spring-boot-app.jar
EOF

RUN chmod +x /app/entrypoint.sh && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]