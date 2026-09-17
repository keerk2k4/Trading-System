FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /workspace

# Build domain engine dependency
COPY domain-engine/pom.xml domain-engine/pom.xml
RUN mvn -f domain-engine/pom.xml dependency:go-offline

COPY domain-engine/src domain-engine/src
RUN mvn -f domain-engine/pom.xml clean install -Dmaven.test.skip=true

# Build trade executor
COPY trade-executor/pom.xml trade-executor/pom.xml
RUN mvn -f trade-executor/pom.xml dependency:go-offline

COPY trade-executor/src trade-executor/src

RUN mvn -f trade-executor/pom.xml clean package -Dmaven.test.skip=true

# Runtime stage
FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=builder /workspace/trade-executor/target/trade-executor-1.0.0.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]

