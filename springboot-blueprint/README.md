# Aurelia FX Academy — Forex Academy Management System

## Runtime Architecture Overview

This workspace includes:
1. **Live Interactive Full-Stack Web Application** (`server.ts`, `server/`, `src/`):
   - **Backend**: Express + Node.js (`node:sqlite` relational database with foreign keys across 30+ tables, HMAC-SHA256 Bearer authentication, `scrypt` password hashing, Multer secure file uploads, ExcelJS `.xlsx` export, server-side payment order & signature verification, and full RBAC for `ADMIN`, `MENTOR`, and `STUDENT`).
   - **Frontend**: React 19 + TypeScript + Tailwind CSS + Chart.js + jsPDF printable/downloadable receipts & reports.
2. **Spring Boot + MySQL 8 Blueprint Artifacts** (`springboot-blueprint/`, `database/forex_academy_db.sql`):
   - `database/forex_academy_db.sql`: Full 30-table MySQL 8 DDL schema with indexes, unique constraints, and foreign keys.
   - `springboot-blueprint/pom.xml` & `application.properties`: Maven configuration for Java 21, Spring Boot 3.4, Spring Security, Spring Data JPA, Apache POI, OpenPDF, and MySQL 8.

## Maven Package Layout (Java 21 Target)
- `com.aureliafx.config` — SecurityFilterChain, CORS, OpenAPI, PasswordEncoder (BCrypt)
- `com.aureliafx.controller` — REST endpoints for Auth, Admin, Courses, Admissions, Payments, Mentors, LiveClasses, Materials, Exams, Attendance, Notifications, Referrals, Brokers, Doubts, Reports
- `com.aureliafx.dto` — Request/Response validation DTOs with Jakarta Validation
- `com.aureliafx.entity` — 30 JPA `@Entity` models mapped to `forex_academy_db`
- `com.aureliafx.repository` — Spring Data JPA repositories
- `com.aureliafx.service` & `service.impl` — Transactional business logic, ID/credential generator, payment HMAC verification
- `com.aureliafx.security` — `JwtAuthenticationFilter`, `JwtTokenProvider`, `CustomUserDetailsService`
- `com.aureliafx.exception` — `@RestControllerAdvice` global exception handler
- `com.aureliafx.util` — Apache POI Excel builder & OpenPDF receipt generator
