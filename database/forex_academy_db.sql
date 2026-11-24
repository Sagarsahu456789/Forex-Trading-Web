-- ============================================================================
-- Aurelia FX Academy — MySQL 8 Database Schema (30 Relational Tables)
-- Database: forex_academy_db
-- ============================================================================

CREATE DATABASE IF NOT EXISTS forex_academy_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE forex_academy_db;

-- 1. users
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'MENTOR', 'STUDENT') NOT NULL,
  full_name VARCHAR(140) NOT NULL,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- 2. students
CREATE TABLE students (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  student_id_code VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(160) NOT NULL,
  mobile VARCHAR(30) NOT NULL,
  address TEXT,
  date_of_birth DATE,
  avatar_url VARCHAR(255),
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referred_by_code VARCHAR(32),
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_students_code (student_id_code)
) ENGINE=InnoDB;

-- 3. mentors
CREATE TABLE mentors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  mentor_code VARCHAR(32) NOT NULL UNIQUE,
  specialization VARCHAR(160) NOT NULL,
  experience_years INT NOT NULL DEFAULT 5,
  qualification VARCHAR(160),
  bio TEXT,
  avatar_url VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mentors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. courses
CREATE TABLE courses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(255),
  duration VARCHAR(80) NOT NULL,
  fees DECIMAL(12, 2) NOT NULL,
  discounted_fees DECIMAL(12, 2) NOT NULL,
  syllabus_json JSON NOT NULL,
  outcomes_json JSON NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  mentor_id BIGINT NULL,
  pdf_material_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_courses_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE SET NULL,
  INDEX idx_courses_status (status)
) ENGINE=InnoDB;

-- 5. admissions
CREATE TABLE admissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admission_no VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(160) NOT NULL,
  mobile VARCHAR(30) NOT NULL,
  address TEXT,
  date_of_birth DATE,
  course_id BIGINT NOT NULL,
  admission_date DATE NOT NULL,
  course_duration VARCHAR(80) NOT NULL,
  total_fees DECIMAL(12, 2) NOT NULL,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  final_fees DECIMAL(12, 2) NOT NULL,
  payment_status ENUM('PENDING', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'PENDING',
  meeting_date DATE NULL,
  meeting_time VARCHAR(20) NULL,
  meeting_reason VARCHAR(255),
  remarks TEXT,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  approved_by BIGINT NULL,
  student_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admissions_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_admissions_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_admissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  INDEX idx_admissions_status_date (status, admission_date)
) ENGINE=InnoDB;

-- 6. enrollments
CREATE TABLE enrollments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  admission_id BIGINT NULL,
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  progress_pct INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'COMPLETED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  UNIQUE KEY uq_enrollment_student_course (student_id, course_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 7. meetings
CREATE TABLE meetings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admission_id BIGINT NULL,
  title VARCHAR(180) NOT NULL,
  meeting_date DATE NOT NULL,
  meeting_time VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  status ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_meetings_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. fee_structures
CREATE TABLE fee_structures (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL UNIQUE,
  total_fee DECIMAL(12, 2) NOT NULL,
  installment_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  max_installments INT NOT NULL DEFAULT 3,
  due_days INT NOT NULL DEFAULT 30,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_structures_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. discounts
CREATE TABLE discounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(140) NOT NULL,
  discount_type ENUM('PERCENT', 'FLAT') NOT NULL,
  value DECIMAL(12, 2) NOT NULL,
  course_id BIGINT NULL,
  valid_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_discounts_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10. offers
CREATE TABLE offers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  badge_text VARCHAR(60),
  valid_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- 11. payments
CREATE TABLE payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT NOT NULL,
  enrollment_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  discount_applied DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  payment_method ENUM('RAZORPAY', 'UPI', 'CARD', 'BANK_TRANSFER') NOT NULL,
  payment_mode ENUM('FULL', 'PARTIAL', 'INSTALLMENT') NOT NULL,
  gateway_order_id VARCHAR(120) NOT NULL UNIQUE,
  gateway_payment_id VARCHAR(120) NULL,
  gateway_signature VARCHAR(255) NULL,
  status ENUM('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  due_date DATE NULL,
  paid_at TIMESTAMP NULL,
  verified_by_server BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  INDEX idx_payments_status_date (status, paid_at)
) ENGINE=InnoDB;

-- 12. payment_receipts
CREATE TABLE payment_receipts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  payment_id BIGINT NOT NULL UNIQUE,
  student_id BIGINT NOT NULL,
  student_code VARCHAR(32) NOT NULL,
  student_name VARCHAR(140) NOT NULL,
  course_name VARCHAR(180) NOT NULL,
  payment_amount DECIMAL(12, 2) NOT NULL,
  remaining_balance DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(40) NOT NULL,
  reference_id VARCHAR(120) NOT NULL,
  payment_status VARCHAR(40) NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 13. live_classes
CREATE TABLE live_classes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  class_date DATE NOT NULL,
  start_time VARCHAR(20) NOT NULL,
  duration_mins INT NOT NULL DEFAULT 60,
  meeting_platform ENUM('ZOOM', 'GOOGLE_MEET') NOT NULL DEFAULT 'ZOOM',
  meeting_link VARCHAR(500) NOT NULL,
  status ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_live_classes_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_classes_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. class_recordings
CREATE TABLE class_recordings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  live_class_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  recording_url VARCHAR(500) NOT NULL,
  duration_label VARCHAR(40),
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recordings_class FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordings_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15. study_materials
CREATE TABLE study_materials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  category ENUM('PDF_NOTES', 'TRADING_STRATEGY', 'TECHNICAL_DOC', 'FUNDAMENTAL_DOC', 'ASSIGNMENT', 'VIDEO', 'PRACTICE') NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(120) NOT NULL,
  downloadable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_materials_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_materials_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 16. attendance
CREATE TABLE attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL,
  remarks VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_daily (student_id, course_id, attendance_date),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 17. exams
CREATE TABLE exams (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  total_marks INT NOT NULL,
  passing_marks INT NOT NULL,
  duration_mins INT NOT NULL,
  scheduled_at DATETIME NULL,
  results_published BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exams_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_exams_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 18. questions
CREATE TABLE questions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  exam_id BIGINT NOT NULL,
  question_text TEXT NOT NULL,
  marks INT NOT NULL DEFAULT 5,
  explanation TEXT,
  sort_order INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_questions_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 19. exam_options
CREATE TABLE exam_options (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT NOT NULL,
  option_text VARCHAR(500) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 20. exam_submissions
CREATE TABLE exam_submissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  exam_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP NULL,
  auto_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  score INT NOT NULL DEFAULT 0,
  total_marks INT NOT NULL DEFAULT 0,
  percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  feedback TEXT,
  status ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADED') NOT NULL DEFAULT 'IN_PROGRESS',
  UNIQUE KEY uq_submission_exam_student (exam_id, student_id),
  CONSTRAINT fk_submissions_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 21. exam_answers
CREATE TABLE exam_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  selected_option_id BIGINT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  marks_awarded INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_answers_submission FOREIGN KEY (submission_id) REFERENCES exam_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_answers_option FOREIGN KEY (selected_option_id) REFERENCES exam_options(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 22. notifications
CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(60) NOT NULL,
  target_role ENUM('ALL', 'STUDENT', 'MENTOR', 'COURSE') NOT NULL DEFAULT 'ALL',
  course_id BIGINT NULL,
  sender_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 23. referrals
CREATE TABLE referrals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referrer_student_id BIGINT NOT NULL,
  referred_email VARCHAR(160) NOT NULL,
  referred_name VARCHAR(140) NOT NULL,
  referred_student_id BIGINT NULL,
  admission_id BIGINT NULL,
  status ENUM('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_referrals_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 24. referral_rewards
CREATE TABLE referral_rewards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referral_id BIGINT NOT NULL UNIQUE,
  student_id BIGINT NOT NULL,
  reward_amount DECIMAL(10, 2) NOT NULL,
  reward_status ENUM('PENDING', 'APPROVED', 'PAID') NOT NULL DEFAULT 'PENDING',
  approved_by BIGINT NULL,
  approved_at TIMESTAMP NULL,
  CONSTRAINT fk_rewards_referral FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
  CONSTRAINT fk_rewards_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_rewards_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 25. brokers
CREATE TABLE brokers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  logo_text VARCHAR(60),
  description TEXT NOT NULL,
  educational_notes TEXT,
  official_url VARCHAR(500) NOT NULL,
  partner_url VARCHAR(500) NOT NULL,
  regulation_info VARCHAR(180),
  min_deposit VARCHAR(80),
  leverage_info VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 26. student_doubts
CREATE TABLE student_doubts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  mentor_id BIGINT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  attachment_name VARCHAR(255),
  attachment_path VARCHAR(500),
  status ENUM('PENDING', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_doubts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_doubts_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_doubts_mentor FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 27. doubt_replies
CREATE TABLE doubt_replies (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doubt_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  author_name VARCHAR(140) NOT NULL,
  author_role VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_replies_doubt FOREIGN KEY (doubt_id) REFERENCES student_doubts(id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 28. events
CREATE TABLE events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  event_date DATE NOT NULL,
  location VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  status ENUM('UPCOMING', 'COMPLETED') NOT NULL DEFAULT 'UPCOMING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 29. gallery
CREATE TABLE gallery (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption TEXT,
  event_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gallery_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 30. audit_logs
CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  actor_email VARCHAR(160),
  actor_role VARCHAR(30),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  details TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- ============================================================================
-- Sample Seed Data (Courses, Offers, Brokers, Events)
-- Note: Create Admin account on first launch via /api/auth/setup-admin
-- ============================================================================

INSERT INTO offers (title, description, badge_text, valid_until, is_active) VALUES
('Institutional Cohort Grant', 'Save up to 15% on full-tuition enrollment for upcoming seasonal trading cohorts.', '15% Tuition Grant', '2026-12-31', TRUE),
('Multi-Module Progression Credit', 'Graduates of Forex Trading Beginner Course receive priority credit toward Advanced Price Action.', 'Alumni Credit', '2026-12-31', TRUE);

INSERT INTO discounts (code, title, discount_type, value, valid_until, is_active) VALUES
('AURELIA10', 'Institutional Early Enrollment 10% Off', 'PERCENT', 10.00, '2026-12-31', TRUE),
('FXGRANT150', 'Flat $150 Cohort Scholarship', 'FLAT', 150.00, '2026-12-31', TRUE);

INSERT INTO brokers (name, logo_text, description, educational_notes, official_url, partner_url, regulation_info, min_deposit, leverage_info, is_active) VALUES
('Meridian Prime FX', 'MPFX', 'Multi-regulated institutional liquidity venue offering raw ECN spreads on major and cross currency pairs for educational simulation and live execution.', 'Recommended for practicing spread calculation, swap mechanics, and limit order execution in demo environments.', 'https://example.com/meridian-prime', 'https://example.com/meridian-prime?ref=aurelia', 'FCA / ASIC Tier-1 Framework', '$200 Demo / Live', 'Up to 1:30 Retail', TRUE),
('Vanguard Currency Clearing', 'VCC', 'Transparent execution desk featuring MetaTrader 5 and cTrader educational sandbox accounts with historical tick data.', 'Ideal for backtesting technical price action setups and journaling risk-to-reward ratios.', 'https://example.com/vanguard-cc', 'https://example.com/vanguard-cc?ref=aurelia', 'CySEC / MAS Regulated', '$100 Standard', 'Up to 1:30 Retail', TRUE);
