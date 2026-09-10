FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /workspace

COPY domain-engine/pom.xml domain-engine/pom.xml
RUN mvn -f domain-engine/pom.xml dependency:go-offline

COPY domain-engine/src domain-engine/src
RUN mvn -f domain-engine/pom.xml clean install -DskipTests

COPY spring-boot-app/pom.xml spring-boot-app/pom.xml
RUN mvn -f spring-boot-app/pom.xml dependency:go-offline

COPY spring-boot-app/src spring-boot-app/src
RUN mvn -f spring-boot-app/pom.xml clean package -DskipTests