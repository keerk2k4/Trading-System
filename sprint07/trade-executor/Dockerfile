FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /workspace

# Build domain engine dependency
COPY ../domain-engine/pom.xml domain-engine/pom.xml
RUN mvn -f domain-engine/pom.xml dependency:go-offline

COPY ../domain-engine/src domain-engine/src
RUN mvn -f domain-engine/pom.xml clean install -DskipTests

# Build trade executor
COPY pom.xml .
COPY src/ src/

RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=builder /workspace/target/trade-executor-1.0.0.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]

