# SonarQube and DevSecOps Scanning — Setup Guide

Story: **SE1 Team 5 — SonarQube Quality Gate and DevSecOps Scanning**

This document explains how to run SonarQube locally against every project in this
repository, and how to run the additional security scans (dependency scanning,
secret detection) required by this story. Every team member runs this **on their
own machine, independently** — SonarQube is not a shared server, each person gets
their own local container and their own results.

---

## Projects covered

| Project | Folder | Language |
|---|---|---|
| Domain Engine | `domain-engine/` | Java (Maven) |
| Trade REST API | `spring-boot-app/` | Java (Maven) |
| Trade Executor | `trade-executor/` | Java (Maven) |
| Analytics Pipeline | `etl/` | Python |

---

## Prerequisites

- Docker Desktop installed and running (check the whale icon in your system tray)
- Maven and a JDK already working (`mvn -version` should print real output)
- Python 3.12+ installed, for scanning the `etl/` project

---

## Step 1 — Start your own SonarQube container

```powershell
docker run -d --name team4-sonarqube -p 9000:9000 sonarqube:community
```

Wait about a minute for it to fully start, then open:

```
http://localhost:9000
```

## Step 2 — Log in for the first time

- Username: `admin`
- Password: `admin`

You will immediately be forced to set a real new password.

## Step 3 — Create one project per folder above

In the SonarQube dashboard, create four projects, using these exact keys:

- `domain-engine`
- `spring-boot-app`
- `trade-executor`
- `trade-analytics-etl`

Choose **"Locally"** as the analysis method for each.

## Step 4 — Generate one token, and export it (never commit it)

When prompted, generate a **User Token** (or **Global Analysis Token**) — this one
token works across all four projects, so you only need to do this once.

**Copy the token immediately — it is only ever shown once.**

Set it as an environment variable in your terminal:

```powershell
$env:SONAR_TOKEN="your-real-token-here"
```

This must be set again every time you open a new terminal window. **Never** paste
the real token into any file that gets committed to the repository.

---

## Step 5 — Scan the three Java projects

Each of the three Java projects already has the SonarQube Maven plugin added to
its `pom.xml`:

```xml
<plugin>
    <groupId>org.sonarsource.scanner.maven</groupId>
    <artifactId>sonar-maven-plugin</artifactId>
    <version>3.11.0.3922</version>
</plugin>
```

Run the scan from inside each project folder, one at a time:

```powershell
cd domain-engine
mvn clean verify sonar:sonar "-Dsonar.projectKey=domain-engine" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"

cd ../spring-boot-app
mvn clean verify sonar:sonar "-Dsonar.projectKey=spring-boot-app" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"

cd ../trade-executor
mvn clean verify sonar:sonar "-Dsonar.projectKey=trade-executor" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"
```

Each `-D` argument is quoted individually — this avoids a common PowerShell
parsing issue where the `:` characters in the URL get misread.

## Step 6 — Scan the Python project (`etl/`)

Python projects use a different scanner than Maven-based Java projects. Install
it once:

```powershell
choco install sonarqube-scanner
```

If Chocolatey isn't available, download the scanner manually instead from:
`https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/`

Create `etl/sonar-project.properties`:

```properties
sonar.projectKey=trade-analytics-etl
sonar.sources=src
sonar.tests=tests
sonar.python.version=3.12
```

Then run:

```powershell
cd etl
sonar-scanner "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"
```

---

## Step 7 — Check the actual quality gate result

Go to `http://localhost:9000` and click into each of the four projects. Each one
shows an independent **Passed** or **Failed** badge — this is the actual quality
gate this story requires. Read every reported issue and fix it; do **not** mark
anything "Won't Fix" — that dismissal is still visible on the dashboard and does
not count as passing at review.

---

## Step 8 — Dependency scanning

**For each Java project:**

```powershell
mvn org.owasp:dependency-check-maven:check
```

**For the Python project:**

```powershell
pip install pip-audit
cd etl
pip-audit
```

## Step 9 — Secret detection

Run from the repository root (`sprint07/`), so it checks every project and the
git history at once:

```powershell
docker run --rm -v ${PWD}:/repo trufflesecurity/trufflehog:latest filesystem /repo
```

---

## For every other team member setting this up on their own machine

SonarQube is **not shared** between machines. Each person must independently:

1. Confirm Docker Desktop is running
2. `git pull` to get the `pom.xml` plugin changes already committed
3. Run their **own** container (Step 1)
4. Log in and set their **own** password (Step 2)
5. Create their **own** four projects (Step 3)
6. Generate their **own** token (Step 4)
7. Run the same scan commands above (Steps 5-6), using their own token
8. Check their own dashboard at `http://localhost:9000` (Step 7)

Nobody can see anyone else's scan results unless they run this setup themselves.

---

## What this story explicitly requires, and where to find it

- **No new blocker/critical issue, no unreviewed security hotspot** — visible on
  each project's dashboard page after scanning
- **Duplication and coverage on new code within thresholds** — visible on the
  same dashboard, under the "New Code" tab
- **SAST, dependency scanning, secret detection all run locally** — SAST is
  covered by the SonarQube scan itself; dependency scanning and secret detection
  are Steps 8 and 9 above
- **Findings are fixed, not silenced** — do not use "Won't Fix" in the dashboard# SonarQube and DevSecOps Scanning — Setup Guide

Story: **Team 4 — SonarQube Quality Gate and DevSecOps Scanning**

This document explains how to run SonarQube locally against every project in this
repository, and how to run the additional security scans (dependency scanning,
secret detection) required by this story. Every team member runs this **on their
own machine, independently** — SonarQube is not a shared server, each person gets
their own local container and their own results.

---

## Projects covered

| Project | Folder | Language |
|---|---|---|
| Domain Engine | `domain-engine/` | Java (Maven) |
| Trade REST API | `spring-boot-app/` | Java (Maven) |
| Trade Executor | `trade-executor/` | Java (Maven) |
| Analytics Pipeline | `etl/` | Python |

---

## Prerequisites

- Docker Desktop installed and running (check the whale icon in your system tray)
- Maven and a JDK already working (`mvn -version` should print real output)
- Python 3.12+ installed, for scanning the `etl/` project

---

## Step 1 — Start your own SonarQube container

```powershell
docker run -d --name team4-sonarqube -p 9000:9000 sonarqube:community
```

Wait about a minute for it to fully start, then open:

```
http://localhost:9000
```

## Step 2 — Log in for the first time

- Username: `admin`
- Password: `admin`

You will immediately be forced to set a real new password.

## Step 3 — Create one project per folder above

In the SonarQube dashboard, create four projects, using these exact keys:

- `domain-engine`
- `spring-boot-app`
- `trade-executor`
- `trade-analytics-etl`

Choose **"Locally"** as the analysis method for each.

## Step 4 — Generate one token, and export it (never commit it)

When prompted, generate a **User Token** (or **Global Analysis Token**) — this one
token works across all four projects, so you only need to do this once.

**Copy the token immediately — it is only ever shown once.**

Set it as an environment variable in your terminal:

```powershell
$env:SONAR_TOKEN="your-real-token-here"
```

This must be set again every time you open a new terminal window. **Never** paste
the real token into any file that gets committed to the repository.

---

## Step 5 — Scan the three Java projects

Each of the three Java projects already has the SonarQube Maven plugin added to
its `pom.xml`:

```xml
<plugin>
    <groupId>org.sonarsource.scanner.maven</groupId>
    <artifactId>sonar-maven-plugin</artifactId>
    <version>3.11.0.3922</version>
</plugin>
```

Run the scan from inside each project folder, one at a time:

```powershell
cd domain-engine
mvn clean verify sonar:sonar "-Dsonar.projectKey=domain-engine" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"

cd ../spring-boot-app
mvn clean verify sonar:sonar "-Dsonar.projectKey=spring-boot-app" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"

cd ../trade-executor
mvn clean verify sonar:sonar "-Dsonar.projectKey=trade-executor" "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"
```

Each `-D` argument is quoted individually — this avoids a common PowerShell
parsing issue where the `:` characters in the URL get misread.

## Step 6 — Scan the Python project (`etl/`)

Python projects use a different scanner than Maven-based Java projects. Install
it once:

```powershell
choco install sonarqube-scanner
```

If Chocolatey isn't available, download the scanner manually instead from:
`https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/`

Create `etl/sonar-project.properties`:

```properties
sonar.projectKey=trade-analytics-etl
sonar.sources=src
sonar.tests=tests
sonar.python.version=3.12
```

Then run:

```powershell
cd etl
sonar-scanner "-Dsonar.host.url=http://localhost:9000" "-Dsonar.token=$env:SONAR_TOKEN"
```

---

## Step 7 — Check the actual quality gate result

Go to `http://localhost:9000` and click into each of the four projects. Each one
shows an independent **Passed** or **Failed** badge — this is the actual quality
gate this story requires. Read every reported issue and fix it; do **not** mark
anything "Won't Fix" — that dismissal is still visible on the dashboard and does
not count as passing at review.

---

## Step 8 — Dependency scanning

**For each Java project:**

```powershell
mvn org.owasp:dependency-check-maven:check
```

**For the Python project:**

```powershell
pip install pip-audit
cd etl
pip-audit
```

## Step 9 — Secret detection

Run from the repository root (`sprint07/`), so it checks every project and the
git history at once:

```powershell
docker run --rm -v ${PWD}:/repo trufflesecurity/trufflehog:latest filesystem /repo
```

---

## For every other team member setting this up on their own machine

SonarQube is **not shared** between machines. Each person must independently:

1. Confirm Docker Desktop is running
2. `git pull` to get the `pom.xml` plugin changes already committed
3. Run their **own** container (Step 1)
4. Log in and set their **own** password (Step 2)
5. Create their **own** four projects (Step 3)
6. Generate their **own** token (Step 4)
7. Run the same scan commands above (Steps 5-6), using their own token
8. Check their own dashboard at `http://localhost:9000` (Step 7)

Nobody can see anyone else's scan results unless they run this setup themselves.

---

## What this story explicitly requires, and where to find it

- **No new blocker/critical issue, no unreviewed security hotspot** — visible on
  each project's dashboard page after scanning
- **Duplication and coverage on new code within thresholds** — visible on the
  same dashboard, under the "New Code" tab
- **SAST, dependency scanning, secret detection all run locally** — SAST is
  covered by the SonarQube scan itself; dependency scanning and secret detection
  are Steps 8 and 9 above
- **Findings are fixed, not silenced** — do not use "Won't Fix" in the dashboard