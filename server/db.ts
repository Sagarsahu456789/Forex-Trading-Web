import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'forex_academy.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MENTOR', 'STUDENT')),
      full_name TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      email_verified INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT,
      status TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mentors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      mentor_code TEXT NOT NULL UNIQUE,
      specialization TEXT NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 5,
      qualification TEXT,
      bio TEXT,
      avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      student_id_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      address TEXT,
      date_of_birth TEXT,
      avatar_url TEXT,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by_code TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      duration TEXT NOT NULL,
      fees REAL NOT NULL,
      discounted_fees REAL NOT NULL,
      syllabus_json TEXT NOT NULL,
      outcomes_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
      mentor_id INTEGER REFERENCES mentors(id) ON DELETE SET NULL,
      pdf_material_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_no TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      mobile TEXT NOT NULL,
      address TEXT,
      date_of_birth TEXT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      admission_date TEXT NOT NULL,
      course_duration TEXT NOT NULL,
      total_fees REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      final_fees REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING', 'PARTIAL', 'PAID')),
      meeting_date TEXT,
      meeting_time TEXT,
      meeting_reason TEXT,
      remarks TEXT,
      referred_by_code TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      progress_pct INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED')),
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      meeting_time TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fee_structures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
      total_fee REAL NOT NULL,
      installment_allowed INTEGER NOT NULL DEFAULT 1,
      max_installments INTEGER NOT NULL DEFAULT 3,
      due_days INTEGER NOT NULL DEFAULT 30,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT', 'FLAT')),
      value REAL NOT NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      valid_until TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      badge_text TEXT,
      valid_until TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      discount_applied REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      payment_mode TEXT NOT NULL,
      gateway_order_id TEXT NOT NULL UNIQUE,
      gateway_payment_id TEXT,
      gateway_signature TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED')),
      due_date TEXT,
      paid_at TEXT,
      verified_by_server INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      student_code TEXT NOT NULL,
      student_name TEXT NOT NULL,
      course_name TEXT NOT NULL,
      payment_amount REAL NOT NULL,
      remaining_balance REAL NOT NULL,
      payment_method TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      class_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 60,
      meeting_platform TEXT NOT NULL DEFAULT 'ZOOM',
      meeting_link TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      live_class_id INTEGER NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      recording_url TEXT NOT NULL,
      duration_label TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      downloadable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'LATE')),
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      total_marks INTEGER NOT NULL,
      passing_marks INTEGER NOT NULL,
      duration_mins INTEGER NOT NULL,
      scheduled_at TEXT,
      results_published INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      marks INTEGER NOT NULL DEFAULT 5,
      explanation TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exam_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exam_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      auto_submitted INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      total_marks INTEGER NOT NULL DEFAULT 0,
      percentage REAL NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS', 'SUBMITTED', 'GRADED')),
      UNIQUE(exam_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS exam_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_id INTEGER REFERENCES exam_options(id) ON DELETE SET NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      marks_awarded INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL,
      target_role TEXT NOT NULL DEFAULT 'ALL',
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(notification_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      referred_email TEXT NOT NULL,
      referred_name TEXT NOT NULL,
      referred_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_id INTEGER NOT NULL UNIQUE REFERENCES referrals(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      reward_amount REAL NOT NULL,
      reward_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(reward_status IN ('PENDING', 'APPROVED', 'PAID')),
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS referral_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      reward_amount REAL NOT NULL DEFAULT 100,
      terms TEXT NOT NULL DEFAULT 'Qualifying referral requires full admission approval and initial verified fee payment.'
    );

    CREATE TABLE IF NOT EXISTS brokers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_text TEXT,
      description TEXT NOT NULL,
      educational_notes TEXT,
      official_url TEXT NOT NULL,
      partner_url TEXT NOT NULL,
      regulation_info TEXT,
      min_deposit TEXT,
      leverage_info TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_doubts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      mentor_id INTEGER REFERENCES mentors(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      attachment_name TEXT,
      attachment_path TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doubt_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doubt_id INTEGER NOT NULL REFERENCES student_doubts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      event_date TEXT NOT NULL,
      location TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPCOMING',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      caption TEXT,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
