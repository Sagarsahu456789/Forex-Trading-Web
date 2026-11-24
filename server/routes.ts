import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { buildXlsxBuffer, type XlsxColumn } from './xlsx.ts';
import { db, UPLOADS_DIR } from './db.ts';
import {
  createGatewaySignature,
  generateOneTimePassword,
  hashPassword,
  resolveSafeUploadPath,
  sanitizeHttpUrl,
  signToken,
  verifyAdminPasscodeOverride,
  verifyGatewaySignature,
  verifyPassword,
  verifyToken,
  type TokenPayload,
} from './security.ts';

interface AuthedRequest extends Request {
  user?: TokenPayload;
}

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_UPLOAD_EXTENSIONS.has(ext) ? ext : '.bin';
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPG, TXT, DOCX.'));
      return;
    }
    cb(null, true);
  },
});

// Ephemeral in-memory password reset tokens (15 min TTL)
const resetTokens = new Map<string, { userId: number; email: string; exp: number }>();

function logAudit(
  user: TokenPayload | undefined,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: string,
  ip?: string
): void {
  db.prepare(`
    INSERT INTO audit_logs (user_id, actor_email, actor_role, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user?.sub ?? null,
    user?.email ?? 'anonymous',
    user?.role ?? 'PUBLIC',
    action,
    entityType,
    entityId !== null ? String(entityId) : null,
    details,
    ip ?? 'unknown'
  );
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }
  const dbUser = db
    .prepare('SELECT id, role, email, username, is_active FROM users WHERE id = ?')
    .get(payload.sub) as { id: number; role: string; email: string; username: string; is_active: number } | undefined;

  if (!dbUser || dbUser.is_active !== 1) {
    res.status(403).json({ error: 'Account is deactivated or unavailable' });
    return;
  }
  req.user = payload;
  next();
}

function requireRole(...roles: Array<'ADMIN' | 'MENTOR' | 'STUDENT'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this resource' });
      return;
    }
    next();
  };
}

function getMentorIdForUser(userId: number): number | null {
  const row = db.prepare('SELECT id FROM mentors WHERE user_id = ?').get(userId) as { id: number } | undefined;
  return row ? row.id : null;
}

function getStudentForUser(userId: number) {
  return db.prepare('SELECT * FROM students WHERE user_id = ?').get(userId) as
    | {
        id: number;
        user_id: number;
        student_id_code: string;
        full_name: string;
        email: string;
        mobile: string;
        address: string;
        date_of_birth: string;
        referral_code: string;
        referred_by_code: string | null;
        status: string;
      }
    | undefined;
}

function isStudentEnrolled(studentId: number, courseId: number): boolean {
  const row = db
    .prepare("SELECT id FROM enrollments WHERE student_id = ? AND course_id = ? AND status IN ('ACTIVE', 'COMPLETED')")
    .get(studentId, courseId);
  return Boolean(row);
}

function isMentorAssignedToCourse(mentorId: number, courseId: number): boolean {
  const row = db.prepare('SELECT id FROM courses WHERE id = ? AND mentor_id = ?').get(courseId, mentorId);
  return Boolean(row);
}

function nextStudentCode(): string {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM students').get() as { cnt: number };
  return `FXA-2026-${String(row.cnt + 1).padStart(4, '0')}`;
}

function nextAdmissionNo(): string {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM admissions').get() as { cnt: number };
  return `ADM-2026-${String(row.cnt + 1).padStart(3, '0')}`;
}

function nextReceiptNumber(): string {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM payment_receipts').get() as { cnt: number };
  return `RCPT-2026-${String(row.cnt + 1).padStart(4, '0')}`;
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // =========================================================================
  // 1. AUTHENTICATION & FIRST-RUN ADMIN SETUP
  // =========================================================================

  router.get('/auth/bootstrap-status', (_req, res) => {
    const adminRow = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    const envOverride = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    res.json({
      needsAdminSetup: !adminRow && !envOverride,
      hasAdmin: Boolean(adminRow),
      hasEnvPasscode: envOverride,
    });
  });

  router.post('/auth/setup-admin', (req, res) => {
    const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    const envOverride = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    if (existingAdmin || envOverride) {
      res.status(409).json({ error: 'Administrator account is already initialized.' });
      return;
    }

    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (fullName.length < 2 || !email.includes('@') || password.length < 8) {
      res.status(400).json({ error: 'Provide full name, valid email, and password (minimum 8 characters).' });
      return;
    }

    const username = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'admin';
    const passwordHash = hashPassword(password);

    try {
      const insert = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, is_active, email_verified, must_change_password)
        VALUES (?, ?, ?, 'ADMIN', ?, 1, 1, 0)
      `);
      const result = insert.run(username, email, passwordHash, fullName);
      const userId = Number(result.lastInsertRowid);
      const token = signToken({ sub: userId, role: 'ADMIN', email, username });
      logAudit({ sub: userId, role: 'ADMIN', email, username, exp: 0 }, 'ADMIN_BOOTSTRAP', 'USER', userId, 'First-run admin account claimed', req.ip);
      res.status(201).json({
        token,
        user: { id: userId, username, email, role: 'ADMIN', fullName, mustChangePassword: false, emailVerified: true },
      });
    } catch (err) {
      res.status(409).json({ error: 'Email or username already exists.' });
    }
  });

  router.post('/auth/login', (req, res) => {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const expectedRole = req.body?.role ? String(req.body.role).toUpperCase() : null;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Email/Username/Student ID and password are required.' });
      return;
    }

    // Check optional ADMIN_PASSCODE override if logging in as ADMIN
    if (expectedRole === 'ADMIN' && verifyAdminPasscodeOverride(password)) {
      let adminUser = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get() as
        | { id: number; username: string; email: string; role: 'ADMIN'; full_name: string; is_active: number }
        | undefined;
      if (!adminUser) {
        const resInsert = db
          .prepare(
            "INSERT INTO users (username, email, password_hash, role, full_name, is_active, email_verified) VALUES ('admin', ?, '!ENV_PASSCODE', 'ADMIN', 'Academy Administrator', 1, 1)"
          )
          .run(identifier.includes('@') ? identifier : 'admin@aureliafx.edu');
        adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(resInsert.lastInsertRowid)) as typeof adminUser;
      }
      if (adminUser) {
        db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(adminUser.id);
        db.prepare("INSERT INTO login_history (user_id, email, role, status, ip_address) VALUES (?, ?, 'ADMIN', 'SUCCESS', ?)").run(
          adminUser.id,
          adminUser.email,
          req.ip ?? 'unknown'
        );
        const token = signToken({ sub: adminUser.id, role: 'ADMIN', email: adminUser.email, username: adminUser.username });
        res.json({
          token,
          user: {
            id: adminUser.id,
            username: adminUser.username,
            email: adminUser.email,
            role: 'ADMIN',
            fullName: adminUser.full_name,
            mustChangePassword: false,
            emailVerified: true,
          },
        });
        return;
      }
    }

    // Standard lookup by email, username, or student_id_code
    let userRow = db
      .prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ? LIMIT 1')
      .get(identifier, identifier) as
      | {
          id: number;
          username: string;
          email: string;
          password_hash: string;
          role: 'ADMIN' | 'MENTOR' | 'STUDENT';
          full_name: string;
          phone: string | null;
          is_active: number;
          email_verified: number;
          must_change_password: number;
        }
      | undefined;

    if (!userRow) {
      const studentMatch = db
        .prepare('SELECT u.* FROM students s JOIN users u ON s.user_id = u.id WHERE lower(s.student_id_code) = ? LIMIT 1')
        .get(identifier) as typeof userRow;
      if (studentMatch) userRow = studentMatch;
    }

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      db.prepare("INSERT INTO login_history (user_id, email, role, status, ip_address) VALUES (?, ?, ?, 'FAILED', ?)").run(
        userRow?.id ?? null,
        identifier,
        expectedRole ?? userRow?.role ?? 'UNKNOWN',
        req.ip ?? 'unknown'
      );
      res.status(401).json({ error: 'Invalid credentials or account password not yet issued.' });
      return;
    }

    if (expectedRole && userRow.role !== expectedRole) {
      res.status(403).json({ error: `This portal is restricted to ${expectedRole} accounts.` });
      return;
    }

    if (userRow.is_active !== 1) {
      res.status(403).json({ error: 'Your account has been deactivated. Contact Academy Administration.' });
      return;
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userRow.id);
    db.prepare("INSERT INTO login_history (user_id, email, role, status, ip_address) VALUES (?, ?, ?, 'SUCCESS', ?)").run(
      userRow.id,
      userRow.email,
      userRow.role,
      req.ip ?? 'unknown'
    );

    const token = signToken({
      sub: userRow.id,
      role: userRow.role,
      email: userRow.email,
      username: userRow.username,
    });

    const student = userRow.role === 'STUDENT' ? getStudentForUser(userRow.id) : undefined;
    const mentor =
      userRow.role === 'MENTOR'
        ? (db.prepare('SELECT * FROM mentors WHERE user_id = ?').get(userRow.id) as Record<string, unknown> | undefined)
        : undefined;

    res.json({
      token,
      user: {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
        role: userRow.role,
        fullName: userRow.full_name,
        phone: userRow.phone,
        emailVerified: userRow.email_verified === 1,
        mustChangePassword: userRow.must_change_password === 1,
        studentCode: student?.student_id_code ?? null,
        mentorCode: (mentor?.mentor_code as string | undefined) ?? null,
      },
    });
  });

  router.post('/auth/register', (req, res) => {
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const mobile = String(req.body?.mobile ?? '').trim();
    const password = String(req.body?.password ?? '');
    const address = String(req.body?.address ?? '').trim();
    const dob = String(req.body?.dob ?? '').trim();
    const referredByCode = String(req.body?.referredByCode ?? '').trim().toUpperCase() || null;

    if (fullName.length < 2 || !email.includes('@') || mobile.length < 6 || password.length < 8) {
      res.status(400).json({ error: 'Full name, valid email, mobile number, and password (min 8 chars) are required.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'student';
    const username = `${baseUsername}.${crypto.randomBytes(2).toString('hex')}`;
    const passwordHash = hashPassword(password);
    const studentCode = nextStudentCode();
    const refCode = `REF-${studentCode.replace('FXA-', '')}`;

    db.exec('BEGIN');
    try {
      const uRes = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, role, full_name, phone, is_active, email_verified, must_change_password)
           VALUES (?, ?, ?, 'STUDENT', ?, ?, 1, 0, 0)`
        )
        .run(username, email, passwordHash, fullName, mobile);
      const userId = Number(uRes.lastInsertRowid);

      const stRes = db
        .prepare(
          `INSERT INTO students (user_id, student_id_code, full_name, email, mobile, address, date_of_birth, referral_code, referred_by_code, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
        )
        .run(userId, studentCode, fullName, email, mobile, address || null, dob || null, refCode, referredByCode);
      const studentId = Number(stRes.lastInsertRowid);

      if (referredByCode) {
        const referrer = db.prepare('SELECT id FROM students WHERE referral_code = ?').get(referredByCode) as { id: number } | undefined;
        if (referrer && referrer.id !== studentId) {
          db.prepare(
            `INSERT INTO referrals (referrer_student_id, referred_email, referred_name, referred_student_id, status)
             VALUES (?, ?, ?, ?, 'PENDING')`
          ).run(referrer.id, email, fullName, studentId);
        }
      }

      db.exec('COMMIT');

      const token = signToken({ sub: userId, role: 'STUDENT', email, username });
      logAudit({ sub: userId, role: 'STUDENT', email, username, exp: 0 }, 'STUDENT_REGISTER', 'STUDENT', studentId, `Registered ${studentCode}`, req.ip);

      res.status(201).json({
        token,
        user: {
          id: userId,
          username,
          email,
          role: 'STUDENT',
          fullName,
          phone: mobile,
          emailVerified: false,
          mustChangePassword: false,
          studentCode,
        },
      });
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to complete registration.' });
    }
  });

  router.post('/auth/verify-email', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user!.sub);
    logAudit(req.user, 'EMAIL_VERIFIED', 'USER', req.user!.sub, 'Email verified in portal', req.ip);
    res.json({ verified: true });
  });

  router.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user!.sub) as
      | { id: number; password_hash: string }
      | undefined;
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), user.id);
    logAudit(req.user, 'PASSWORD_CHANGED', 'USER', user.id, 'User updated password', req.ip);
    res.json({ updated: true });
  });

  router.post('/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(email) as { id: number; email: string } | undefined;
    if (user) {
      const code = crypto.randomBytes(16).toString('hex');
      resetTokens.set(code, { userId: user.id, email: user.email, exp: Date.now() + 15 * 60 * 1000 });
      // Never return reset token in production API responses; confirm dispatch generically
      if (process.env.NODE_ENV !== 'production') {
        res.json({
          message: 'If an account matches that email, a reset verification token has been dispatched.',
          devPreviewResetToken: code,
        });
        return;
      }
    }
    res.json({ message: 'If an account matches that email, a reset verification token has been dispatched.' });
  });

  router.post('/auth/reset-password', (req, res) => {
    const token = String(req.body?.token ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    const entry = resetTokens.get(token);
    if (!entry || entry.exp < Date.now()) {
      res.status(400).json({ error: 'Reset token is invalid or expired.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), entry.userId);
    resetTokens.delete(token);
    res.json({ reset: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = db
      .prepare('SELECT id, username, email, role, full_name, phone, is_active, email_verified, must_change_password, created_at, last_login_at FROM users WHERE id = ?')
      .get(req.user!.sub) as Record<string, unknown> | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const student = req.user!.role === 'STUDENT' ? getStudentForUser(req.user!.sub) : null;
    const mentor =
      req.user!.role === 'MENTOR' ? db.prepare('SELECT * FROM mentors WHERE user_id = ?').get(req.user!.sub) : null;
    const loginHistory = db
      .prepare('SELECT id, status, ip_address, created_at FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 10')
      .all(req.user!.sub);
    res.json({ user, student, mentor, loginHistory });
  });

  // =========================================================================
  // 2. PUBLIC WEBSITE ENDPOINTS
  // =========================================================================

  router.get('/public/overview', (_req, res) => {
    const courses = db
      .prepare(
        `SELECT c.*, u.full_name as mentor_name, m.specialization as mentor_specialization, m.avatar_url as mentor_avatar
         FROM courses c
         LEFT JOIN mentors m ON c.mentor_id = m.id
         LEFT JOIN users u ON m.user_id = u.id
         WHERE c.status = 'ACTIVE'
         ORDER BY c.id ASC`
      )
      .all()
      .map((c: Record<string, unknown>) => ({
        ...c,
        syllabus: JSON.parse(String(c.syllabus_json || '[]')),
        outcomes: JSON.parse(String(c.outcomes_json || '[]')),
      }));

    const mentors = db
      .prepare(
        `SELECT m.id, m.mentor_code, m.specialization, m.experience_years, m.qualification, m.bio, m.avatar_url, u.full_name
         FROM mentors m
         JOIN users u ON m.user_id = u.id
         WHERE m.is_active = 1`
      )
      .all();

    const offers = db.prepare('SELECT * FROM offers WHERE is_active = 1').all();
    const events = db.prepare('SELECT * FROM events ORDER BY event_date ASC').all();
    const gallery = db.prepare('SELECT * FROM gallery ORDER BY id DESC').all();
    const brokers = db.prepare('SELECT * FROM brokers WHERE is_active = 1 ORDER BY id ASC').all();
    const publicClasses = db
      .prepare(
        `SELECT lc.id, lc.title, lc.class_date, lc.start_time, lc.duration_mins, lc.meeting_platform, lc.status,
                c.title as course_title, u.full_name as mentor_name
         FROM live_classes lc
         JOIN courses c ON lc.course_id = c.id
         JOIN mentors m ON lc.mentor_id = m.id
         JOIN users u ON m.user_id = u.id
         WHERE lc.status IN ('SCHEDULED', 'LIVE')
         ORDER BY lc.class_date ASC LIMIT 6`
      )
      .all();

    res.json({ courses, mentors, offers, events, gallery, brokers, publicClasses });
  });

  router.post('/public/admissions', (req, res) => {
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const mobile = String(req.body?.mobile ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const dob = String(req.body?.dob ?? '').trim();
    const courseId = Number(req.body?.courseId);
    const meetingDate = String(req.body?.meetingDate ?? '').trim() || null;
    const meetingTime = String(req.body?.meetingTime ?? '').trim() || null;
    const meetingReason = String(req.body?.meetingReason ?? '').trim() || null;
    const remarks = String(req.body?.remarks ?? '').trim() || null;
    const discountCode = String(req.body?.discountCode ?? '').trim().toUpperCase();
    const referredByCode = String(req.body?.referredByCode ?? '').trim().toUpperCase() || null;

    if (fullName.length < 2 || !email.includes('@') || mobile.length < 6 || !courseId) {
      res.status(400).json({ error: 'Full name, valid email, mobile number, and selected course are required.' });
      return;
    }

    const course = db.prepare("SELECT * FROM courses WHERE id = ? AND status = 'ACTIVE'").get(courseId) as
      | { id: number; title: string; duration: string; fees: number; discounted_fees: number }
      | undefined;

    if (!course) {
      res.status(404).json({ error: 'Selected course not found or inactive.' });
      return;
    }

    let extraDiscount = 0;
    if (discountCode) {
      const disc = db.prepare('SELECT * FROM discounts WHERE code = ? AND is_active = 1').get(discountCode) as
        | { discount_type: 'PERCENT' | 'FLAT'; value: number }
        | undefined;
      if (disc) {
        extraDiscount = disc.discount_type === 'PERCENT' ? (course.discounted_fees * disc.value) / 100 : disc.value;
      }
    }

    const totalDiscount = Number(((course.fees - course.discounted_fees) + extraDiscount).toFixed(2));
    const finalFees = Math.max(0, Number((course.fees - totalDiscount).toFixed(2)));
    const admissionNo = nextAdmissionNo();

    const result = db
      .prepare(
        `INSERT INTO admissions (
          admission_no, full_name, email, mobile, address, date_of_birth, course_id, admission_date,
          course_duration, total_fees, discount, final_fees, payment_status,
          meeting_date, meeting_time, meeting_reason, remarks, referred_by_code, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'PENDING')`
      )
      .run(
        admissionNo,
        fullName,
        email,
        mobile,
        address || null,
        dob || null,
        course.id,
        course.duration,
        course.fees,
        totalDiscount,
        finalFees,
        meetingDate,
        meetingTime,
        meetingReason,
        remarks,
        referredByCode
      );

    const admissionId = Number(result.lastInsertRowid);
    if (meetingDate && meetingTime) {
      db.prepare(`INSERT INTO meetings (admission_id, title, meeting_date, meeting_time, reason) VALUES (?, ?, ?, ?, ?)`).run(
        admissionId,
        `Admission Consultation — ${fullName}`,
        meetingDate,
        meetingTime,
        meetingReason || 'Program Counseling'
      );
    }

    res.status(201).json({
      admissionId,
      admissionNo,
      courseTitle: course.title,
      finalFees,
      status: 'PENDING',
    });
  });

  router.post('/public/contact', (req, res) => {
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const phone = String(req.body?.phone ?? '').trim();
    const subject = String(req.body?.subject ?? '').trim();
    const message = String(req.body?.message ?? '').trim();

    if (fullName.length < 2 || !email.includes('@') || message.length < 5) {
      res.status(400).json({ error: 'Name, valid email, and message are required.' });
      return;
    }

    const r = db
      .prepare(`INSERT INTO contact_inquiries (full_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`)
      .run(fullName, email, phone || null, subject || 'General Academy Inquiry', message);

    res.status(201).json({ id: Number(r.lastInsertRowid), status: 'RECEIVED' });
  });

  // =========================================================================
  // 3. ADMIN DASHBOARD & CORE ADMINISTRATION
  // =========================================================================

  router.get('/admin/dashboard', requireAuth, requireRole('ADMIN'), (req, res) => {
    const filterDate = req.query.date ? String(req.query.date) : null;
    const filterMonth = req.query.month ? String(req.query.month) : null; // YYYY-MM
    const filterYear = req.query.year ? String(req.query.year) : null; // YYYY

    const totalStudents = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
    const activeStudents = (db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'ACTIVE'").get() as { c: number }).c;
    const newAdmissionsToday = (
      db.prepare("SELECT COUNT(*) as c FROM admissions WHERE admission_date = date('now')").get() as { c: number }
    ).c;
    const monthlyAdmissions = (
      db
        .prepare("SELECT COUNT(*) as c FROM admissions WHERE strftime('%Y-%m', admission_date) = coalesce(?, strftime('%Y-%m', 'now'))")
        .get(filterMonth) as { c: number }
    ).c;
    const yearlyAdmissions = (
      db
        .prepare("SELECT COUNT(*) as c FROM admissions WHERE strftime('%Y', admission_date) = coalesce(?, strftime('%Y', 'now'))")
        .get(filterYear) as { c: number }
    ).c;
    const totalCourses = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as { c: number }).c;
    const totalMentors = (db.prepare('SELECT COUNT(*) as c FROM mentors WHERE is_active = 1').get() as { c: number }).c;
    const upcomingClasses = (
      db.prepare("SELECT COUNT(*) as c FROM live_classes WHERE status IN ('SCHEDULED', 'LIVE')").get() as { c: number }
    ).c;
    const totalRevenue = (
      db.prepare("SELECT coalesce(SUM(amount), 0) as s FROM payments WHERE status = 'VERIFIED'").get() as { s: number }
    ).s;

    const totalBilled = (
      db.prepare("SELECT coalesce(SUM(final_fees), 0) as s FROM admissions WHERE status = 'APPROVED'").get() as { s: number }
    ).s;
    const pendingFees = Math.max(0, totalBilled - totalRevenue);

    // Chart datasets
    const dailyAdmissionsSeries = db
      .prepare(
        `SELECT admission_date as label, COUNT(*) as count
         FROM admissions
         WHERE (? IS NULL OR admission_date = ?)
         GROUP BY admission_date
         ORDER BY admission_date ASC LIMIT 14`
      )
      .all(filterDate, filterDate);

    const monthlyAdmissionsSeries = db
      .prepare(
        `SELECT strftime('%Y-%m', admission_date) as label, COUNT(*) as count
         FROM admissions
         WHERE (? IS NULL OR strftime('%Y', admission_date) = ?)
         GROUP BY strftime('%Y-%m', admission_date)
         ORDER BY label ASC`
      )
      .all(filterYear, filterYear);

    const monthlyRevenueSeries = db
      .prepare(
        `SELECT strftime('%Y-%m', paid_at) as label, coalesce(SUM(amount), 0) as total
         FROM payments
         WHERE status = 'VERIFIED'
         GROUP BY strftime('%Y-%m', paid_at)
         ORDER BY label ASC`
      )
      .all();

    const courseEnrollmentSeries = db
      .prepare(
        `SELECT c.title as label, COUNT(e.id) as count
         FROM courses c
         LEFT JOIN enrollments e ON e.course_id = c.id
         GROUP BY c.id
         ORDER BY count DESC`
      )
      .all();

    const paymentStatusSeries = db
      .prepare(`SELECT status as label, COUNT(*) as count, coalesce(SUM(amount), 0) as total FROM payments GROUP BY status`)
      .all();

    const attendanceSeries = db
      .prepare(`SELECT status as label, COUNT(*) as count FROM attendance GROUP BY status`)
      .all();

    const recentActivities = {
      recentStudents: db.prepare('SELECT id, student_id_code, full_name, email, status, created_at FROM students ORDER BY id DESC LIMIT 5').all(),
      recentAdmissions: db
        .prepare(
          `SELECT a.id, a.admission_no, a.full_name, a.status, a.final_fees, a.admission_date, c.title as course_title
           FROM admissions a JOIN courses c ON a.course_id = c.id ORDER BY a.id DESC LIMIT 6`
        )
        .all(),
      recentPayments: db
        .prepare(
          `SELECT p.id, p.amount, p.payment_method, p.status, p.paid_at, s.full_name as student_name, s.student_id_code
           FROM payments p JOIN students s ON p.student_id = s.id ORDER BY p.id DESC LIMIT 6`
        )
        .all(),
      upcomingMeetings: db.prepare('SELECT * FROM meetings ORDER BY meeting_date ASC LIMIT 5').all(),
      latestSubmissions: db
        .prepare(
          `SELECT es.id, es.score, es.total_marks, es.percentage, es.passed, es.submitted_at,
                  s.full_name as student_name, e.title as exam_title
           FROM exam_submissions es
           JOIN students s ON es.student_id = s.id
           JOIN exams e ON es.exam_id = e.id
           ORDER BY es.id DESC LIMIT 5`
        )
        .all(),
      recentNotifications: db.prepare('SELECT id, title, category, target_role, created_at FROM notifications ORDER BY id DESC LIMIT 5').all(),
    };

    res.json({
      kpis: {
        totalStudents,
        activeStudents,
        newAdmissionsToday,
        monthlyAdmissions,
        yearlyAdmissions,
        totalCourses,
        totalRevenue,
        pendingFees,
        totalMentors,
        upcomingClasses,
      },
      charts: {
        dailyAdmissionsSeries,
        monthlyAdmissionsSeries,
        monthlyRevenueSeries,
        courseEnrollmentSeries,
        paymentStatusSeries,
        attendanceSeries,
      },
      recentActivities,
    });
  });

  // Courses CRUD (Admin)
  router.get('/admin/courses', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*, u.full_name as mentor_name
         FROM courses c
         LEFT JOIN mentors m ON c.mentor_id = m.id
         LEFT JOIN users u ON m.user_id = u.id
         ORDER BY c.id ASC`
      )
      .all()
      .map((c: Record<string, unknown>) => ({
        ...c,
        syllabus: JSON.parse(String(c.syllabus_json || '[]')),
        outcomes: JSON.parse(String(c.outcomes_json || '[]')),
      }));
    res.json({ courses: rows });
  });

  router.post('/admin/courses', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const duration = String(req.body?.duration ?? '').trim();
    const fees = Number(req.body?.fees);
    const discountedFees = Number(req.body?.discountedFees ?? fees);
    const mentorId = req.body?.mentorId ? Number(req.body.mentorId) : null;
    const imageUrl = String(req.body?.imageUrl ?? '/src/assets/images/course_forex_beginner_1795518344034.jpg').trim();
    const syllabus = Array.isArray(req.body?.syllabus) ? req.body.syllabus : [];
    const outcomes = Array.isArray(req.body?.outcomes) ? req.body.outcomes : [];

    if (!title || !description || !duration || Number.isNaN(fees) || fees <= 0) {
      res.status(400).json({ error: 'Course title, description, duration, and valid fees are required.' });
      return;
    }

    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;
    const result = db
      .prepare(
        `INSERT INTO courses (slug, title, description, image_url, duration, fees, discounted_fees, syllabus_json, outcomes_json, status, mentor_id, pdf_material_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      )
      .run(
        slug,
        title,
        description,
        imageUrl,
        duration,
        fees,
        discountedFees,
        JSON.stringify(syllabus),
        JSON.stringify(outcomes),
        mentorId,
        `/api/courses/${slug}/syllabus-pdf`
      );
    const courseId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO fee_structures (course_id, total_fee, installment_allowed, max_installments, due_days) VALUES (?, ?, 1, 3, 30)').run(
      courseId,
      discountedFees
    );
    logAudit(req.user, 'COURSE_CREATED', 'COURSE', courseId, `Created course ${title}`, req.ip);
    res.status(201).json({ id: courseId, slug });
  });

  router.put('/admin/courses/:id', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const duration = String(req.body?.duration ?? '').trim();
    const fees = Number(req.body?.fees);
    const discountedFees = Number(req.body?.discountedFees ?? fees);
    const mentorId = req.body?.mentorId ? Number(req.body.mentorId) : null;
    const status = req.body?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const syllabus = Array.isArray(req.body?.syllabus) ? req.body.syllabus : [];
    const outcomes = Array.isArray(req.body?.outcomes) ? req.body.outcomes : [];

    db.prepare(
      `UPDATE courses SET title = ?, description = ?, duration = ?, fees = ?, discounted_fees = ?, mentor_id = ?, status = ?, syllabus_json = ?, outcomes_json = ?
       WHERE id = ?`
    ).run(title, description, duration, fees, discountedFees, mentorId, status, JSON.stringify(syllabus), JSON.stringify(outcomes), id);

    logAudit(req.user, 'COURSE_UPDATED', 'COURSE', id, `Updated course ${title}`, req.ip);
    res.json({ updated: true });
  });

  router.patch('/admin/courses/:id/status', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    db.prepare('UPDATE courses SET status = ? WHERE id = ?').run(status, id);
    logAudit(req.user, 'COURSE_STATUS', 'COURSE', id, `Status set to ${status}`, req.ip);
    res.json({ updated: true, status });
  });

  router.delete('/admin/courses/:id', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const enrolled = db.prepare('SELECT COUNT(*) as c FROM enrollments WHERE course_id = ?').get(id) as { c: number };
    if (enrolled.c > 0) {
      db.prepare("UPDATE courses SET status = 'INACTIVE' WHERE id = ?").run(id);
      res.json({ deactivated: true, message: 'Course has active enrollments and was deactivated instead of hard-deleted.' });
      return;
    }
    db.prepare('DELETE FROM courses WHERE id = ?').run(id);
    logAudit(req.user, 'COURSE_DELETED', 'COURSE', id, 'Deleted course', req.ip);
    res.json({ deleted: true });
  });

  // Admissions Management (Admin)
  router.get('/admin/admissions', requireAuth, requireRole('ADMIN'), (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const q = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;

    const rows = db
      .prepare(
        `SELECT a.*, c.title as course_title, s.student_id_code
         FROM admissions a
         JOIN courses c ON a.course_id = c.id
         LEFT JOIN students s ON a.student_id = s.id
         WHERE (? IS NULL OR a.status = ?)
           AND (? IS NULL OR a.course_id = ?)
           AND (? IS NULL OR a.admission_date >= ?)
           AND (? IS NULL OR a.admission_date <= ?)
           AND (? IS NULL OR lower(a.full_name) LIKE ? OR lower(a.email) LIKE ? OR lower(a.admission_no) LIKE ?)
         ORDER BY a.id DESC`
      )
      .all(status, status, courseId, courseId, from, from, to, to, q, q, q, q);

    res.json({ admissions: rows });
  });

  router.post('/admin/admissions/:id/approve', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const admissionId = Number(req.params.id);
    const adm = db.prepare('SELECT * FROM admissions WHERE id = ?').get(admissionId) as
      | {
          id: number;
          admission_no: string;
          full_name: string;
          email: string;
          mobile: string;
          address: string | null;
          date_of_birth: string | null;
          course_id: number;
          referred_by_code: string | null;
          status: string;
        }
      | undefined;

    if (!adm) {
      res.status(404).json({ error: 'Admission record not found.' });
      return;
    }
    if (adm.status === 'APPROVED') {
      res.status(409).json({ error: 'Admission has already been approved.' });
      return;
    }

    let existingUser = db.prepare('SELECT id, username, email FROM users WHERE lower(email) = ?').get(adm.email.toLowerCase()) as
      | { id: number; username: string; email: string }
      | undefined;
    let studentRow = existingUser
      ? (db.prepare('SELECT * FROM students WHERE user_id = ?').get(existingUser.id) as { id: number; student_id_code: string } | undefined)
      : undefined;

    let generatedCredentials: { studentIdCode: string; username: string; temporaryPassword: string } | null = null;

    db.exec('BEGIN');
    try {
      if (!existingUser) {
        const tempPassword = generateOneTimePassword(12);
        const username = `${adm.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}.${crypto.randomBytes(2).toString('hex')}`;
        const uRes = db
          .prepare(
            `INSERT INTO users (username, email, password_hash, role, full_name, phone, is_active, email_verified, must_change_password)
             VALUES (?, ?, ?, 'STUDENT', ?, ?, 1, 1, 1)`
          )
          .run(username, adm.email, hashPassword(tempPassword), adm.full_name, adm.mobile);
        const userId = Number(uRes.lastInsertRowid);
        const studentCode = nextStudentCode();
        const refCode = `REF-${studentCode.replace('FXA-', '')}`;

        const stRes = db
          .prepare(
            `INSERT INTO students (user_id, student_id_code, full_name, email, mobile, address, date_of_birth, referral_code, referred_by_code, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
          )
          .run(userId, studentCode, adm.full_name, adm.email, adm.mobile, adm.address, adm.date_of_birth, refCode, adm.referred_by_code);

        studentRow = { id: Number(stRes.lastInsertRowid), student_id_code: studentCode };
        generatedCredentials = {
          studentIdCode: studentCode,
          username,
          temporaryPassword: tempPassword,
        };
      } else if (!studentRow) {
        const studentCode = nextStudentCode();
        const refCode = `REF-${studentCode.replace('FXA-', '')}`;
        const stRes = db
          .prepare(
            `INSERT INTO students (user_id, student_id_code, full_name, email, mobile, address, date_of_birth, referral_code, referred_by_code, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
          )
          .run(existingUser.id, studentCode, adm.full_name, adm.email, adm.mobile, adm.address, adm.date_of_birth, refCode, adm.referred_by_code);
        studentRow = { id: Number(stRes.lastInsertRowid), student_id_code: studentCode };
      }

      db.prepare("UPDATE admissions SET status = 'APPROVED', approved_by = ?, student_id = ? WHERE id = ?").run(
        req.user!.sub,
        studentRow!.id,
        admissionId
      );

      db.prepare(
        `INSERT OR IGNORE INTO enrollments (student_id, course_id, admission_id, progress_pct, status)
         VALUES (?, ?, ?, 5, 'ACTIVE')`
      ).run(studentRow!.id, adm.course_id, admissionId);

      // Link qualifying referral if referred_by_code was provided
      if (adm.referred_by_code) {
        const referrer = db.prepare('SELECT id FROM students WHERE referral_code = ?').get(adm.referred_by_code) as { id: number } | undefined;
        if (referrer && referrer.id !== studentRow!.id) {
          const existingRef = db.prepare('SELECT id FROM referrals WHERE referred_student_id = ?').get(studentRow!.id) as { id: number } | undefined;
          let referralId: number;
          if (existingRef) {
            referralId = existingRef.id;
            db.prepare("UPDATE referrals SET admission_id = ?, status = 'QUALIFIED' WHERE id = ?").run(admissionId, referralId);
          } else {
            const rRes = db
              .prepare(
                `INSERT INTO referrals (referrer_student_id, referred_email, referred_name, referred_student_id, admission_id, status)
                 VALUES (?, ?, ?, ?, ?, 'QUALIFIED')`
              )
              .run(referrer.id, adm.email, adm.full_name, studentRow!.id, admissionId);
            referralId = Number(rRes.lastInsertRowid);
          }
          const settings = db.prepare('SELECT reward_amount FROM referral_settings WHERE id = 1').get() as { reward_amount: number };
          db.prepare(
            `INSERT OR IGNORE INTO referral_rewards (referral_id, student_id, reward_amount, reward_status)
             VALUES (?, ?, ?, 'PENDING')`
          ).run(referralId, referrer.id, settings?.reward_amount ?? 100);
        }
      }

      db.prepare(
        `INSERT INTO notifications (title, message, category, target_role, course_id, sender_id)
         VALUES (?, ?, 'New Batch Started', 'STUDENT', ?, ?)`
      ).run(
        `Admission Confirmed (${adm.admission_no})`,
        `Welcome ${adm.full_name}! Your enrollment (${studentRow!.student_id_code}) is active.`,
        adm.course_id,
        req.user!.sub
      );

      db.exec('COMMIT');
      logAudit(req.user, 'ADMISSION_APPROVED', 'ADMISSION', admissionId, `Approved ${adm.admission_no} -> ${studentRow!.student_id_code}`, req.ip);

      res.json({
        approved: true,
        studentIdCode: studentRow!.student_id_code,
        generatedCredentials,
      });
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Failed to approve admission.' });
    }
  });

  router.post('/admin/admissions/:id/reject', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const admissionId = Number(req.params.id);
    const remarks = String(req.body?.remarks ?? 'Application declined by Admissions Desk').trim();
    db.prepare("UPDATE admissions SET status = 'REJECTED', remarks = ? WHERE id = ?").run(remarks, admissionId);
    logAudit(req.user, 'ADMISSION_REJECTED', 'ADMISSION', admissionId, remarks, req.ip);
    res.json({ rejected: true });
  });

  // Students Management (Admin)
  router.get('/admin/students', requireAuth, requireRole('ADMIN'), (req, res) => {
    const q = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;

    const rows = db
      .prepare(
        `SELECT s.*, u.username, u.is_active as account_active, u.email_verified,
                group_concat(DISTINCT c.title) as enrolled_courses,
                coalesce((SELECT SUM(amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'VERIFIED'), 0) as total_paid
         FROM students s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN enrollments e ON e.student_id = s.id
         LEFT JOIN courses c ON e.course_id = c.id
         WHERE (? IS NULL OR lower(s.full_name) LIKE ? OR lower(s.student_id_code) LIKE ? OR lower(s.email) LIKE ?)
           AND (? IS NULL OR e.course_id = ?)
         GROUP BY s.id
         ORDER BY s.id DESC`
      )
      .all(q, q, q, q, courseId, courseId);

    res.json({ students: rows });
  });

  router.patch('/admin/students/:id/status', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const studentId = Number(req.params.id);
    const active = Boolean(req.body?.active);
    const student = db.prepare('SELECT user_id, student_id_code FROM students WHERE id = ?').get(studentId) as
      | { user_id: number; student_id_code: string }
      | undefined;
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    db.prepare("UPDATE students SET status = ? WHERE id = ?").run(active ? 'ACTIVE' : 'INACTIVE', studentId);
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active ? 1 : 0, student.user_id);
    logAudit(req.user, 'STUDENT_STATUS', 'STUDENT', studentId, `${student.student_id_code} -> ${active ? 'ACTIVE' : 'INACTIVE'}`, req.ip);
    res.json({ updated: true, active });
  });

  router.post('/admin/students/:id/issue-credentials', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const studentId = Number(req.params.id);
    const student = db
      .prepare('SELECT s.student_id_code, u.id as user_id, u.username, u.email FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = ?')
      .get(studentId) as { student_id_code: string; user_id: number; username: string; email: string } | undefined;
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const tempPassword = generateOneTimePassword(12);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, email_verified = 1, is_active = 1 WHERE id = ?').run(
      hashPassword(tempPassword),
      student.user_id
    );
    logAudit(req.user, 'CREDENTIALS_ISSUED', 'STUDENT', studentId, `Issued temporary password for ${student.student_id_code}`, req.ip);
    res.json({
      studentIdCode: student.student_id_code,
      username: student.username,
      email: student.email,
      temporaryPassword: tempPassword,
    });
  });

  // Mentors Management (Admin)
  router.get('/admin/mentors', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const mentors = db
      .prepare(
        `SELECT m.*, u.full_name, u.email, u.username, u.phone, u.is_active as account_active,
                (SELECT COUNT(*) FROM courses c WHERE c.mentor_id = m.id) as assigned_courses_count,
                (SELECT COUNT(*) FROM live_classes lc WHERE lc.mentor_id = m.id) as live_classes_count
         FROM mentors m
         JOIN users u ON m.user_id = u.id
         ORDER BY m.id ASC`
      )
      .all();
    res.json({ mentors });
  });

  router.post('/admin/mentors', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const fullName = String(req.body?.fullName ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const phone = String(req.body?.phone ?? '').trim();
    const specialization = String(req.body?.specialization ?? '').trim();
    const experienceYears = Number(req.body?.experienceYears ?? 5);
    const qualification = String(req.body?.qualification ?? '').trim();
    const bio = String(req.body?.bio ?? '').trim();

    if (fullName.length < 2 || !email.includes('@') || !specialization) {
      res.status(400).json({ error: 'Full name, valid email, and specialization are required.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const tempPassword = generateOneTimePassword(12);
    const username = `${email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '')}.${crypto.randomBytes(2).toString('hex')}`;
    const cnt = (db.prepare('SELECT COUNT(*) as c FROM mentors').get() as { c: number }).c;
    const mentorCode = `MNT-${101 + cnt}`;

    db.exec('BEGIN');
    try {
      const uRes = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, role, full_name, phone, is_active, email_verified, must_change_password)
           VALUES (?, ?, ?, 'MENTOR', ?, ?, 1, 1, 1)`
        )
        .run(username, email, hashPassword(tempPassword), fullName, phone || null);
      const userId = Number(uRes.lastInsertRowid);

      const mRes = db
        .prepare(
          `INSERT INTO mentors (user_id, mentor_code, specialization, experience_years, qualification, bio, avatar_url, is_active)
           VALUES (?, ?, ?, ?, ?, ?, '/src/assets/images/mentor_portrait_male_1795518344158.jpg', 1)`
        )
        .run(userId, mentorCode, specialization, experienceYears, qualification || null, bio || null);
      const mentorId = Number(mRes.lastInsertRowid);
      db.exec('COMMIT');

      logAudit(req.user, 'MENTOR_CREATED', 'MENTOR', mentorId, `Created mentor ${mentorCode}`, req.ip);
      res.status(201).json({
        id: mentorId,
        mentorCode,
        username,
        email,
        temporaryPassword: tempPassword,
      });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to create mentor.' });
    }
  });

  router.patch('/admin/mentors/:id/status', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const mentorId = Number(req.params.id);
    const active = Boolean(req.body?.active);
    const row = db.prepare('SELECT user_id, mentor_code FROM mentors WHERE id = ?').get(mentorId) as
      | { user_id: number; mentor_code: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Mentor not found' });
      return;
    }
    db.prepare('UPDATE mentors SET is_active = ? WHERE id = ?').run(active ? 1 : 0, mentorId);
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active ? 1 : 0, row.user_id);
    logAudit(req.user, 'MENTOR_STATUS', 'MENTOR', mentorId, `${row.mentor_code} -> ${active ? 'ACTIVE' : 'INACTIVE'}`, req.ip);
    res.json({ updated: true, active });
  });

  router.post('/admin/mentors/:id/issue-credentials', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const mentorId = Number(req.params.id);
    const mentor = db
      .prepare('SELECT m.mentor_code, u.id as user_id, u.username, u.email FROM mentors m JOIN users u ON m.user_id = u.id WHERE m.id = ?')
      .get(mentorId) as { mentor_code: string; user_id: number; username: string; email: string } | undefined;
    if (!mentor) {
      res.status(404).json({ error: 'Mentor not found' });
      return;
    }
    const tempPassword = generateOneTimePassword(12);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, email_verified = 1, is_active = 1 WHERE id = ?').run(
      hashPassword(tempPassword),
      mentor.user_id
    );
    logAudit(req.user, 'CREDENTIALS_ISSUED', 'MENTOR', mentorId, `Issued temporary password for ${mentor.mentor_code}`, req.ip);
    res.json({
      mentorCode: mentor.mentor_code,
      username: mentor.username,
      email: mentor.email,
      temporaryPassword: tempPassword,
    });
  });

  // Discounts, Offers, Brokers, Events, Referrals, Audit Logs (Admin)
  router.get('/admin/discounts-offers', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const discounts = db.prepare('SELECT * FROM discounts ORDER BY id DESC').all();
    const offers = db.prepare('SELECT * FROM offers ORDER BY id DESC').all();
    res.json({ discounts, offers });
  });

  router.post('/admin/discounts', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const title = String(req.body?.title ?? '').trim();
    const discountType = req.body?.discountType === 'FLAT' ? 'FLAT' : 'PERCENT';
    const value = Number(req.body?.value);
    const validUntil = String(req.body?.validUntil ?? '2026-12-31').trim();
    if (!code || !title || Number.isNaN(value) || value <= 0) {
      res.status(400).json({ error: 'Valid code, title, and positive discount value are required.' });
      return;
    }
    const r = db
      .prepare('INSERT INTO discounts (code, title, discount_type, value, valid_until, is_active) VALUES (?, ?, ?, ?, ?, 1)')
      .run(code, title, discountType, value, validUntil);
    logAudit(req.user, 'DISCOUNT_CREATED', 'DISCOUNT', Number(r.lastInsertRowid), code, req.ip);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.post('/admin/offers', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const badgeText = String(req.body?.badgeText ?? 'Cohort Offer').trim();
    const validUntil = String(req.body?.validUntil ?? '2026-12-31').trim();
    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }
    const r = db
      .prepare('INSERT INTO offers (title, description, badge_text, valid_until, is_active) VALUES (?, ?, ?, ?, 1)')
      .run(title, description, badgeText, validUntil);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.get('/admin/brokers', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ brokers: db.prepare('SELECT * FROM brokers ORDER BY id DESC').all() });
  });

  router.post('/admin/brokers', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? '').trim();
    const logoText = String(req.body?.logoText ?? name.slice(0, 4).toUpperCase()).trim();
    const description = String(req.body?.description ?? '').trim();
    const educationalNotes = String(req.body?.educationalNotes ?? '').trim();
    const officialUrl = sanitizeHttpUrl(String(req.body?.officialUrl ?? ''));
    const partnerUrl = sanitizeHttpUrl(String(req.body?.partnerUrl ?? ''));
    const regulationInfo = String(req.body?.regulationInfo ?? '').trim();
    const minDeposit = String(req.body?.minDeposit ?? '').trim();
    const leverageInfo = String(req.body?.leverageInfo ?? '').trim();

    if (!name || !description || !officialUrl || !partnerUrl) {
      res.status(400).json({ error: 'Broker name, description, and valid http/https official and partner URLs are required.' });
      return;
    }

    const r = db
      .prepare(
        `INSERT INTO brokers (name, logo_text, description, educational_notes, official_url, partner_url, regulation_info, min_deposit, leverage_info, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(name, logoText, description, educationalNotes, officialUrl, partnerUrl, regulationInfo, minDeposit, leverageInfo);
    logAudit(req.user, 'BROKER_CREATED', 'BROKER', Number(r.lastInsertRowid), name, req.ip);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.delete('/admin/brokers/:id', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM brokers WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'BROKER_DELETED', 'BROKER', Number(req.params.id), 'Removed broker listing', req.ip);
    res.json({ deleted: true });
  });

  router.get('/admin/referrals', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const referrals = db
      .prepare(
        `SELECT r.*, s.full_name as referrer_name, s.student_id_code as referrer_code, s.referral_code,
                rr.id as reward_id, rr.reward_amount, rr.reward_status
         FROM referrals r
         JOIN students s ON r.referrer_student_id = s.id
         LEFT JOIN referral_rewards rr ON rr.referral_id = r.id
         ORDER BY r.id DESC`
      )
      .all();
    const settings = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get();
    res.json({ referrals, settings });
  });

  router.post('/admin/referrals/:id/approve-reward', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const referralId = Number(req.params.id);
    const ref = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId) as
      | { id: number; referrer_student_id: number; status: string }
      | undefined;
    if (!ref || ref.status === 'PENDING' || ref.status === 'REJECTED') {
      res.status(400).json({ error: 'Only verified qualifying referrals can be approved for reward.' });
      return;
    }
    const settings = db.prepare('SELECT reward_amount FROM referral_settings WHERE id = 1').get() as { reward_amount: number };
    db.prepare("UPDATE referrals SET status = 'REWARDED' WHERE id = ?").run(referralId);
    db.prepare(
      `INSERT INTO referral_rewards (referral_id, student_id, reward_amount, reward_status, approved_by, approved_at)
       VALUES (?, ?, ?, 'APPROVED', ?, datetime('now'))
       ON CONFLICT(referral_id) DO UPDATE SET reward_status = 'APPROVED', approved_by = excluded.approved_by, approved_at = datetime('now')`
    ).run(referralId, ref.referrer_student_id, settings?.reward_amount ?? 100, req.user!.sub);
    logAudit(req.user, 'REFERRAL_REWARD_APPROVED', 'REFERRAL', referralId, 'Approved referral reward', req.ip);
    res.json({ approved: true });
  });

  router.put('/admin/referral-settings', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const rewardAmount = Number(req.body?.rewardAmount);
    const terms = String(req.body?.terms ?? '').trim();
    if (Number.isNaN(rewardAmount) || rewardAmount < 0 || !terms) {
      res.status(400).json({ error: 'Valid reward amount and terms are required.' });
      return;
    }
    db.prepare('UPDATE referral_settings SET reward_amount = ?, terms = ? WHERE id = 1').run(rewardAmount, terms);
    res.json({ updated: true });
  });

  router.get('/admin/audit-logs', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
    const loginHistory = db.prepare('SELECT * FROM login_history ORDER BY id DESC LIMIT 50').all();
    const inquiries = db.prepare('SELECT * FROM contact_inquiries ORDER BY id DESC LIMIT 50').all();
    res.json({ logs, loginHistory, inquiries });
  });

  // Excel (.xlsx) Export (Admin)
  router.get('/admin/export/:type', requireAuth, requireRole('ADMIN'), (req, res) => {
    const type = String(req.params.type);
    let columns: XlsxColumn[] = [];
    let rows: Array<Record<string, unknown>> = [];

    if (type === 'students') {
      columns = [
        { header: 'Student ID', key: 'student_id_code' },
        { header: 'Full Name', key: 'full_name' },
        { header: 'Email', key: 'email' },
        { header: 'Mobile', key: 'mobile' },
        { header: 'Referral Code', key: 'referral_code' },
        { header: 'Status', key: 'status' },
        { header: 'Joined', key: 'created_at' },
      ];
      rows = db
        .prepare('SELECT student_id_code, full_name, email, mobile, referral_code, status, created_at FROM students ORDER BY id DESC')
        .all() as Array<Record<string, unknown>>;
    } else if (type === 'admissions') {
      columns = [
        { header: 'Admission No', key: 'admission_no' },
        { header: 'Applicant', key: 'full_name' },
        { header: 'Course', key: 'course_title' },
        { header: 'Admission Date', key: 'admission_date' },
        { header: 'Final Fees', key: 'final_fees' },
        { header: 'Payment Status', key: 'payment_status' },
        { header: 'Status', key: 'status' },
      ];
      rows = db
        .prepare(
          `SELECT a.admission_no, a.full_name, c.title as course_title, a.admission_date, a.final_fees, a.payment_status, a.status
           FROM admissions a JOIN courses c ON a.course_id = c.id ORDER BY a.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
    } else if (type === 'payments' || type === 'pending-fees') {
      columns = [
        { header: 'Order ID', key: 'gateway_order_id' },
        { header: 'Student ID', key: 'student_id_code' },
        { header: 'Student Name', key: 'student_name' },
        { header: 'Course', key: 'course_title' },
        { header: 'Amount ($)', key: 'amount' },
        { header: 'Method', key: 'payment_method' },
        { header: 'Status', key: 'status' },
        { header: 'Paid At', key: 'paid_at' },
      ];
      rows = db
        .prepare(
          `SELECT p.gateway_order_id, s.student_id_code, s.full_name as student_name, c.title as course_title,
                  p.amount, p.payment_method, p.status, p.paid_at
           FROM payments p
           JOIN students s ON p.student_id = s.id
           JOIN courses c ON p.course_id = c.id
           ORDER BY p.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
    } else if (type === 'attendance') {
      columns = [
        { header: 'Date', key: 'attendance_date' },
        { header: 'Student ID', key: 'student_id_code' },
        { header: 'Student Name', key: 'student_name' },
        { header: 'Course', key: 'course_title' },
        { header: 'Status', key: 'status' },
        { header: 'Remarks', key: 'remarks' },
      ];
      rows = db
        .prepare(
          `SELECT a.attendance_date, s.student_id_code, s.full_name as student_name, c.title as course_title, a.status, a.remarks
           FROM attendance a
           JOIN students s ON a.student_id = s.id
           JOIN courses c ON a.course_id = c.id
           ORDER BY a.attendance_date DESC`
        )
        .all() as Array<Record<string, unknown>>;
    } else if (type === 'exam-results') {
      columns = [
        { header: 'Exam', key: 'exam_title' },
        { header: 'Student ID', key: 'student_id_code' },
        { header: 'Student Name', key: 'student_name' },
        { header: 'Score', key: 'score' },
        { header: 'Total', key: 'total_marks' },
        { header: 'Percentage', key: 'percentage' },
        { header: 'Result', key: 'result_label' },
      ];
      rows = db
        .prepare(
          `SELECT e.title as exam_title, s.student_id_code, s.full_name as student_name, es.score, es.total_marks, es.percentage,
                  CASE WHEN es.passed = 1 THEN 'PASS' ELSE 'FAIL' END as result_label
           FROM exam_submissions es
           JOIN exams e ON es.exam_id = e.id
           JOIN students s ON es.student_id = s.id
           ORDER BY es.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
    } else {
      columns = [
        { header: 'Referrer ID', key: 'referrer_code' },
        { header: 'Referrer Name', key: 'referrer_name' },
        { header: 'Referred Name', key: 'referred_name' },
        { header: 'Referred Email', key: 'referred_email' },
        { header: 'Status', key: 'status' },
      ];
      rows = db
        .prepare(
          `SELECT s.student_id_code as referrer_code, s.full_name as referrer_name, r.referred_name, r.referred_email, r.status
           FROM referrals r JOIN students s ON r.referrer_student_id = s.id ORDER BY r.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
    }

    const buffer = buildXlsxBuffer(type.toUpperCase(), columns, rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="aurelia_${type}_report.xlsx"`);
    res.send(buffer);
  });

  // =========================================================================
  // 4. PAYMENTS, SERVER-SIDE VERIFICATION & RECEIPTS
  // =========================================================================

  router.get('/payments', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role === 'ADMIN') {
      const payments = db
        .prepare(
          `SELECT p.*, s.student_id_code, s.full_name as student_name, c.title as course_title,
                  pr.id as receipt_id, pr.receipt_number
           FROM payments p
           JOIN students s ON p.student_id = s.id
           JOIN courses c ON p.course_id = c.id
           LEFT JOIN payment_receipts pr ON pr.payment_id = p.id
           ORDER BY p.id DESC`
        )
        .all();
      res.json({ payments });
      return;
    }

    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student) {
        res.status(404).json({ error: 'Student profile not found' });
        return;
      }
      const payments = db
        .prepare(
          `SELECT p.*, c.title as course_title, pr.id as receipt_id, pr.receipt_number
           FROM payments p
           JOIN courses c ON p.course_id = c.id
           LEFT JOIN payment_receipts pr ON pr.payment_id = p.id
           WHERE p.student_id = ?
           ORDER BY p.id DESC`
        )
        .all(student.id);
      res.json({ payments });
      return;
    }

    res.status(403).json({ error: 'Mentors do not have access to student billing records.' });
  });

  router.post('/payments/create-order', requireAuth, requireRole('STUDENT', 'ADMIN'), (req: AuthedRequest, res) => {
    const courseId = Number(req.body?.courseId);
    const requestedAmount = Number(req.body?.amount);
    const paymentMethod = String(req.body?.paymentMethod ?? 'RAZORPAY').toUpperCase();
    const paymentMode = String(req.body?.paymentMode ?? 'INSTALLMENT').toUpperCase();
    const discountCode = String(req.body?.discountCode ?? '').trim().toUpperCase();

    const student =
      req.user!.role === 'STUDENT'
        ? getStudentForUser(req.user!.sub)
        : (db.prepare('SELECT * FROM students WHERE id = ?').get(Number(req.body?.studentId)) as ReturnType<typeof getStudentForUser>);

    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    let enrollment = db
      .prepare('SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?')
      .get(student.id, courseId) as { id: number; course_id: number } | undefined;

    const course = db.prepare("SELECT * FROM courses WHERE id = ? AND status = 'ACTIVE'").get(courseId) as
      | { id: number; title: string; discounted_fees: number }
      | undefined;

    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    if (!enrollment) {
      const enrRes = db
        .prepare("INSERT INTO enrollments (student_id, course_id, progress_pct, status) VALUES (?, ?, 0, 'ACTIVE')")
        .run(student.id, course.id);
      enrollment = { id: Number(enrRes.lastInsertRowid), course_id: course.id };
    }

    const paidSoFarRow = db
      .prepare("SELECT coalesce(SUM(amount), 0) as paid FROM payments WHERE student_id = ? AND course_id = ? AND status = 'VERIFIED'")
      .get(student.id, course.id) as { paid: number };

    let discountAmount = 0;
    if (discountCode) {
      const disc = db.prepare('SELECT * FROM discounts WHERE code = ? AND is_active = 1').get(discountCode) as
        | { discount_type: 'PERCENT' | 'FLAT'; value: number }
        | undefined;
      if (disc) {
        discountAmount = disc.discount_type === 'PERCENT' ? (course.discounted_fees * disc.value) / 100 : disc.value;
      }
    }

    const remainingBefore = Math.max(0, course.discounted_fees - discountAmount - paidSoFarRow.paid);
    if (remainingBefore <= 0) {
      res.status(400).json({ error: 'Tuition balance for this course is already fully settled.' });
      return;
    }

    const payableAmount =
      paymentMode === 'FULL'
        ? remainingBefore
        : Math.min(remainingBefore, Math.max(50, Number.isNaN(requestedAmount) ? remainingBefore : requestedAmount));

    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const insertRes = db
      .prepare(
        `INSERT INTO payments (student_id, enrollment_id, course_id, amount, discount_applied, payment_method, payment_mode, gateway_order_id, status, due_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', date('now', '+30 days'), ?)`
      )
      .run(
        student.id,
        enrollment.id,
        course.id,
        payableAmount,
        discountAmount,
        paymentMethod,
        paymentMode,
        orderId,
        `Order created via ${paymentMethod}`
      );

    // Issue sandbox checkout challenge payload (paymentId & signature verified strictly server-side on /verify)
    const sandboxPaymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const sandboxSignature = createGatewaySignature(orderId, sandboxPaymentId);

    res.status(201).json({
      paymentRecordId: Number(insertRes.lastInsertRowid),
      orderId,
      amount: payableAmount,
      currency: 'USD',
      courseTitle: course.title,
      sandboxCheckoutPayload: {
        orderId,
        paymentId: sandboxPaymentId,
        signature: sandboxSignature,
      },
    });
  });

  function finalizeVerifiedPayment(orderId: string, paymentId: string, signature: string, actor?: TokenPayload, ip?: string) {
    if (!verifyGatewaySignature(orderId, paymentId, signature)) {
      return { ok: false as const, status: 400, error: 'Payment signature verification failed. Transaction was not marked paid.' };
    }

    const payment = db.prepare('SELECT * FROM payments WHERE gateway_order_id = ?').get(orderId) as
      | {
          id: number;
          student_id: number;
          course_id: number;
          amount: number;
          discount_applied: number;
          payment_method: string;
          status: string;
        }
      | undefined;

    if (!payment) {
      return { ok: false as const, status: 404, error: 'Payment order not found.' };
    }

    if (payment.status === 'VERIFIED') {
      const existingReceipt = db.prepare('SELECT * FROM payment_receipts WHERE payment_id = ?').get(payment.id);
      return { ok: true as const, receipt: existingReceipt };
    }

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(payment.student_id) as {
      id: number;
      student_id_code: string;
      full_name: string;
    };
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(payment.course_id) as {
      id: number;
      title: string;
      discounted_fees: number;
    };

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE payments SET status = 'VERIFIED', gateway_payment_id = ?, gateway_signature = ?, paid_at = datetime('now'), verified_by_server = 1
         WHERE id = ?`
      ).run(paymentId, signature, payment.id);

      const paidTotal = (
        db
          .prepare("SELECT coalesce(SUM(amount), 0) as s FROM payments WHERE student_id = ? AND course_id = ? AND status = 'VERIFIED'")
          .get(student.id, course.id) as { s: number }
      ).s;

      const remaining = Math.max(0, Number((course.discounted_fees - payment.discount_applied - paidTotal).toFixed(2)));
      const receiptNumber = nextReceiptNumber();

      db.prepare(
        `INSERT INTO payment_receipts (receipt_number, payment_id, student_id, student_code, student_name, course_name, payment_amount, remaining_balance, payment_method, reference_id, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED')`
      ).run(
        receiptNumber,
        payment.id,
        student.id,
        student.student_id_code,
        student.full_name,
        course.title,
        payment.amount,
        remaining,
        payment.payment_method,
        paymentId
      );

      const admissionStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';
      db.prepare('UPDATE admissions SET payment_status = ? WHERE student_id = ? AND course_id = ?').run(
        admissionStatus,
        student.id,
        course.id
      );

      db.exec('COMMIT');
      const receipt = db.prepare('SELECT * FROM payment_receipts WHERE payment_id = ?').get(payment.id);
      logAudit(actor, 'PAYMENT_VERIFIED', 'PAYMENT', payment.id, `Verified ${orderId} ($${payment.amount}) -> ${receiptNumber}`, ip);
      return { ok: true as const, receipt };
    } catch {
      db.exec('ROLLBACK');
      return { ok: false as const, status: 500, error: 'Failed to finalize payment receipt.' };
    }
  }

  router.post('/payments/verify', requireAuth, requireRole('STUDENT', 'ADMIN'), (req: AuthedRequest, res) => {
    const orderId = String(req.body?.orderId ?? '').trim();
    const paymentId = String(req.body?.paymentId ?? '').trim();
    const signature = String(req.body?.signature ?? '').trim();

    const payment = db.prepare('SELECT student_id FROM payments WHERE gateway_order_id = ?').get(orderId) as
      | { student_id: number }
      | undefined;
    if (!payment) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student || student.id !== payment.student_id) {
        res.status(403).json({ error: 'Cannot verify another student payment.' });
        return;
      }
    }

    const result = finalizeVerifiedPayment(orderId, paymentId, signature, req.user, req.ip);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ verified: true, receipt: result.receipt });
  });

  router.post('/payments/webhook', (req, res) => {
    const signature = String(req.headers['x-razorpay-signature'] ?? req.body?.signature ?? '').trim();
    const orderId = String(req.body?.orderId ?? '').trim();
    const paymentId = String(req.body?.paymentId ?? '').trim();
    const result = finalizeVerifiedPayment(orderId, paymentId, signature, undefined, req.ip);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, receipt: result.receipt });
  });

  router.post('/payments/:id/refund', requireAuth, requireRole('ADMIN'), (req: AuthedRequest, res) => {
    const paymentId = Number(req.params.id);
    db.prepare("UPDATE payments SET status = 'REFUNDED', notes = coalesce(notes, '') || ' | Refunded by Admin' WHERE id = ?").run(paymentId);
    db.prepare("UPDATE payment_receipts SET payment_status = 'REFUNDED' WHERE payment_id = ?").run(paymentId);
    logAudit(req.user, 'PAYMENT_REFUNDED', 'PAYMENT', paymentId, 'Payment marked refunded by Admin', req.ip);
    res.json({ refunded: true });
  });

  router.get('/receipts/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const receipt = db.prepare('SELECT * FROM payment_receipts WHERE id = ?').get(id) as
      | { id: number; student_id: number }
      | undefined;
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student || student.id !== receipt.student_id) {
        res.status(403).json({ error: 'Access denied to another student receipt.' });
        return;
      }
    } else if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    res.json({ receipt });
  });

  // =========================================================================
  // 5. MENTOR DASHBOARD, LIVE CLASSES, STUDY MATERIALS, ATTENDANCE, EXAMS
  // =========================================================================

  router.get('/mentor/dashboard', requireAuth, requireRole('MENTOR', 'ADMIN'), (req: AuthedRequest, res) => {
    const mentorId = req.user!.role === 'MENTOR' ? getMentorIdForUser(req.user!.sub) : Number(req.query.mentorId || 1);
    if (!mentorId) {
      res.status(404).json({ error: 'Mentor profile not found' });
      return;
    }

    const assignedCourses = db.prepare('SELECT * FROM courses WHERE mentor_id = ?').all(mentorId);
    const totalStudents = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT e.student_id) as c
           FROM enrollments e JOIN courses c ON e.course_id = c.id
           WHERE c.mentor_id = ?`
        )
        .get(mentorId) as { c: number }
    ).c;

    const upcomingClasses = db
      .prepare(
        `SELECT lc.*, c.title as course_title FROM live_classes lc
         JOIN courses c ON lc.course_id = c.id
         WHERE lc.mentor_id = ? AND lc.status IN ('SCHEDULED', 'LIVE') ORDER BY lc.class_date ASC`
      )
      .all(mentorId);

    const completedClasses = (
      db.prepare("SELECT COUNT(*) as c FROM live_classes WHERE mentor_id = ? AND status = 'COMPLETED'").get(mentorId) as { c: number }
    ).c;

    const students = db
      .prepare(
        `SELECT DISTINCT s.id, s.student_id_code, s.full_name, s.email, c.id as course_id, c.title as course_title
         FROM enrollments e
         JOIN students s ON e.student_id = s.id
         JOIN courses c ON e.course_id = c.id
         WHERE c.mentor_id = ?`
      )
      .all(mentorId);

    res.json({ mentorId, assignedCourses, totalStudents, upcomingClasses, completedClasses, students });
  });

  // Live Classes & Recordings
  router.get('/classes', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role === 'ADMIN') {
      const classes = db
        .prepare(
          `SELECT lc.*, c.title as course_title, u.full_name as mentor_name
           FROM live_classes lc
           JOIN courses c ON lc.course_id = c.id
           JOIN mentors m ON lc.mentor_id = m.id
           JOIN users u ON m.user_id = u.id
           ORDER BY lc.class_date DESC`
        )
        .all();
      const recordings = db
        .prepare(
          `SELECT cr.*, c.title as course_title FROM class_recordings cr JOIN courses c ON cr.course_id = c.id ORDER BY cr.id DESC`
        )
        .all();
      res.json({ classes, recordings });
      return;
    }

    if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      const classes = db
        .prepare(
          `SELECT lc.*, c.title as course_title FROM live_classes lc
           JOIN courses c ON lc.course_id = c.id WHERE lc.mentor_id = ? ORDER BY lc.class_date DESC`
        )
        .all(mentorId);
      const recordings = db
        .prepare(
          `SELECT cr.*, c.title as course_title FROM class_recordings cr
           JOIN courses c ON cr.course_id = c.id WHERE c.mentor_id = ? ORDER BY cr.id DESC`
        )
        .all(mentorId);
      res.json({ classes, recordings });
      return;
    }

    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const classes = db
      .prepare(
        `SELECT lc.*, c.title as course_title, u.full_name as mentor_name
         FROM live_classes lc
         JOIN enrollments e ON e.course_id = lc.course_id AND e.student_id = ?
         JOIN courses c ON lc.course_id = c.id
         JOIN mentors m ON lc.mentor_id = m.id
         JOIN users u ON m.user_id = u.id
         WHERE e.status IN ('ACTIVE', 'COMPLETED')
         ORDER BY lc.class_date DESC`
      )
      .all(student.id);
    const recordings = db
      .prepare(
        `SELECT cr.*, c.title as course_title
         FROM class_recordings cr
         JOIN enrollments e ON e.course_id = cr.course_id AND e.student_id = ?
         JOIN courses c ON cr.course_id = c.id
         ORDER BY cr.id DESC`
      )
      .all(student.id);
    res.json({ classes, recordings });
  });

  router.post('/classes', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const courseId = Number(req.body?.courseId);
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const classDate = String(req.body?.classDate ?? '').trim();
    const startTime = String(req.body?.startTime ?? '').trim();
    const durationMins = Number(req.body?.durationMins ?? 60);
    const meetingPlatform = req.body?.meetingPlatform === 'GOOGLE_MEET' ? 'GOOGLE_MEET' : 'ZOOM';
    const meetingLink = sanitizeHttpUrl(String(req.body?.meetingLink ?? ''));

    if (!courseId || !title || !classDate || !startTime || !meetingLink) {
      res.status(400).json({ error: 'Course, title, date, time, and valid https meeting link are required.' });
      return;
    }

    let mentorId: number | null = null;
    if (req.user!.role === 'MENTOR') {
      mentorId = getMentorIdForUser(req.user!.sub);
      if (!mentorId || !isMentorAssignedToCourse(mentorId, courseId)) {
        res.status(403).json({ error: 'You may only schedule live classes for your assigned courses.' });
        return;
      }
    } else {
      const cRow = db.prepare('SELECT mentor_id FROM courses WHERE id = ?').get(courseId) as { mentor_id: number | null } | undefined;
      mentorId = Number(req.body?.mentorId || cRow?.mentor_id || 1);
    }

    const r = db
      .prepare(
        `INSERT INTO live_classes (course_id, mentor_id, title, description, class_date, start_time, duration_mins, meeting_platform, meeting_link, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')`
      )
      .run(courseId, mentorId, title, description, classDate, startTime, durationMins, meetingPlatform, meetingLink);

    logAudit(req.user, 'LIVE_CLASS_SCHEDULED', 'LIVE_CLASS', Number(r.lastInsertRowid), title, req.ip);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.patch('/classes/:id/status', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? 'COMPLETED').toUpperCase();
    if (!['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    db.prepare('UPDATE live_classes SET status = ? WHERE id = ?').run(status, id);
    res.json({ updated: true, status });
  });

  router.post('/classes/:id/recordings', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const liveClassId = Number(req.params.id);
    const cls = db.prepare('SELECT id, course_id, title FROM live_classes WHERE id = ?').get(liveClassId) as
      | { id: number; course_id: number; title: string }
      | undefined;
    if (!cls) {
      res.status(404).json({ error: 'Live class not found' });
      return;
    }
    const recordingUrl = sanitizeHttpUrl(String(req.body?.recordingUrl ?? ''));
    const title = String(req.body?.title ?? `${cls.title} — Recording`).trim();
    const durationLabel = String(req.body?.durationLabel ?? '60 mins').trim();
    if (!recordingUrl) {
      res.status(400).json({ error: 'Valid http/https recording URL is required.' });
      return;
    }
    const r = db
      .prepare('INSERT INTO class_recordings (live_class_id, course_id, title, recording_url, duration_label) VALUES (?, ?, ?, ?, ?)')
      .run(liveClassId, cls.course_id, title, recordingUrl, durationLabel);
    db.prepare("UPDATE live_classes SET status = 'COMPLETED' WHERE id = ?").run(liveClassId);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // Study Materials (protected file upload & download)
  router.get('/materials', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role === 'ADMIN') {
      const materials = db
        .prepare(
          `SELECT sm.*, c.title as course_title, u.full_name as mentor_name
           FROM study_materials sm
           JOIN courses c ON sm.course_id = c.id
           JOIN mentors m ON sm.mentor_id = m.id
           JOIN users u ON m.user_id = u.id
           ORDER BY sm.id DESC`
        )
        .all();
      res.json({ materials });
      return;
    }
    if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      const materials = db
        .prepare(
          `SELECT sm.*, c.title as course_title FROM study_materials sm
           JOIN courses c ON sm.course_id = c.id WHERE c.mentor_id = ? ORDER BY sm.id DESC`
        )
        .all(mentorId);
      res.json({ materials });
      return;
    }
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const materials = db
      .prepare(
        `SELECT sm.*, c.title as course_title, u.full_name as mentor_name
         FROM study_materials sm
         JOIN enrollments e ON e.course_id = sm.course_id AND e.student_id = ?
         JOIN courses c ON sm.course_id = c.id
         JOIN mentors m ON sm.mentor_id = m.id
         JOIN users u ON m.user_id = u.id
         ORDER BY sm.id DESC`
      )
      .all(student.id);
    res.json({ materials });
  });

  router.post('/materials', requireAuth, requireRole('ADMIN', 'MENTOR'), upload.single('file'), (req: AuthedRequest, res) => {
    const courseId = Number(req.body?.courseId);
    const title = String(req.body?.title ?? '').trim();
    const category = String(req.body?.category ?? 'PDF_NOTES').trim();
    const description = String(req.body?.description ?? '').trim();

    if (!courseId || !title || !req.file) {
      res.status(400).json({ error: 'Course, title, and valid material file (max 10MB) are required.' });
      return;
    }

    let mentorId: number | null = null;
    if (req.user!.role === 'MENTOR') {
      mentorId = getMentorIdForUser(req.user!.sub);
      if (!mentorId || !isMentorAssignedToCourse(mentorId, courseId)) {
        res.status(403).json({ error: 'Mentors can only upload materials to assigned courses.' });
        return;
      }
    } else {
      const cRow = db.prepare('SELECT mentor_id FROM courses WHERE id = ?').get(courseId) as { mentor_id: number | null } | undefined;
      mentorId = cRow?.mentor_id ?? 1;
    }

    const r = db
      .prepare(
        `INSERT INTO study_materials (course_id, mentor_id, title, category, description, file_name, file_path, file_size, mime_type, downloadable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(courseId, mentorId, title, category, description, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype);

    logAudit(req.user, 'MATERIAL_UPLOADED', 'MATERIAL', Number(r.lastInsertRowid), title, req.ip);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.get('/materials/:id/download', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const mat = db.prepare('SELECT * FROM study_materials WHERE id = ?').get(id) as
      | { id: number; course_id: number; mentor_id: number; file_name: string; file_path: string; mime_type: string }
      | undefined;

    if (!mat) {
      res.status(404).json({ error: 'Study material not found.' });
      return;
    }

    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student || !isStudentEnrolled(student.id, mat.course_id)) {
        res.status(403).json({ error: 'Only enrolled students can access this course material.' });
        return;
      }
    } else if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      if (!mentorId || !isMentorAssignedToCourse(mentorId, mat.course_id)) {
        res.status(403).json({ error: 'Access restricted to assigned course mentor.' });
        return;
      }
    }

    const safePath = resolveSafeUploadPath(UPLOADS_DIR, mat.file_path);
    if (!safePath || !fs.existsSync(safePath)) {
      res.status(404).json({ error: 'File unavailable on storage.' });
      return;
    }

    res.setHeader('Content-Type', mat.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${mat.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    res.sendFile(safePath);
  });

  // Attendance Management
  router.get('/attendance', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }
      const records = db
        .prepare(
          `SELECT a.*, c.title as course_title FROM attendance a
           JOIN courses c ON a.course_id = c.id WHERE a.student_id = ? ORDER BY a.attendance_date DESC`
        )
        .all(student.id);
      const total = records.length;
      const attended = records.filter((r: Record<string, unknown>) => r.status === 'PRESENT' || r.status === 'LATE').length;
      const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;
      res.json({ records, percentage, total, attended });
      return;
    }

    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      const records = db
        .prepare(
          `SELECT a.*, s.student_id_code, s.full_name as student_name, c.title as course_title
           FROM attendance a
           JOIN students s ON a.student_id = s.id
           JOIN courses c ON a.course_id = c.id
           WHERE c.mentor_id = ? AND (? IS NULL OR a.course_id = ?)
           ORDER BY a.attendance_date DESC`
        )
        .all(mentorId, courseId, courseId);
      res.json({ records });
      return;
    }

    const records = db
      .prepare(
        `SELECT a.*, s.student_id_code, s.full_name as student_name, c.title as course_title
         FROM attendance a
         JOIN students s ON a.student_id = s.id
         JOIN courses c ON a.course_id = c.id
         WHERE (? IS NULL OR a.course_id = ?)
         ORDER BY a.attendance_date DESC`
      )
      .all(courseId, courseId);
    res.json({ records });
  });

  router.post('/attendance', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const courseId = Number(req.body?.courseId);
    const attendanceDate = String(req.body?.attendanceDate ?? '').trim();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (!courseId || !attendanceDate || entries.length === 0) {
      res.status(400).json({ error: 'Course, date, and attendance entries are required.' });
      return;
    }

    let mentorId: number | null = null;
    if (req.user!.role === 'MENTOR') {
      mentorId = getMentorIdForUser(req.user!.sub);
      if (!mentorId || !isMentorAssignedToCourse(mentorId, courseId)) {
        res.status(403).json({ error: 'Mentors can only mark attendance for assigned courses.' });
        return;
      }
    } else {
      const cRow = db.prepare('SELECT mentor_id FROM courses WHERE id = ?').get(courseId) as { mentor_id: number | null } | undefined;
      mentorId = cRow?.mentor_id ?? 1;
    }

    const stmt = db.prepare(`
      INSERT INTO attendance (student_id, course_id, mentor_id, attendance_date, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, course_id, attendance_date)
      DO UPDATE SET status = excluded.status, remarks = excluded.remarks
    `);

    db.exec('BEGIN');
    try {
      for (const entry of entries) {
        const status = ['PRESENT', 'ABSENT', 'LATE'].includes(String(entry.status)) ? String(entry.status) : 'PRESENT';
        stmt.run(Number(entry.studentId), courseId, mentorId, attendanceDate, status, String(entry.remarks ?? ''));
      }
      db.exec('COMMIT');
      logAudit(req.user, 'ATTENDANCE_MARKED', 'COURSE', courseId, `Marked ${entries.length} students for ${attendanceDate}`, req.ip);
      res.json({ saved: entries.length });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to save attendance.' });
    }
  });

  // =========================================================================
  // 6. ONLINE EXAMINATIONS (MCQ, TIMER, AUTO-SUBMIT, OWNERSHIP)
  // =========================================================================

  router.get('/exams', requireAuth, (req: AuthedRequest, res) => {
    if (req.user!.role === 'ADMIN') {
      const exams = db
        .prepare(
          `SELECT e.*, c.title as course_title, (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count
           FROM exams e JOIN courses c ON e.course_id = c.id ORDER BY e.id DESC`
        )
        .all();
      res.json({ exams });
      return;
    }

    if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      const exams = db
        .prepare(
          `SELECT e.*, c.title as course_title, (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count
           FROM exams e JOIN courses c ON e.course_id = c.id WHERE c.mentor_id = ? ORDER BY e.id DESC`
        )
        .all(mentorId);
      res.json({ exams });
      return;
    }

    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const exams = db
      .prepare(
        `SELECT e.*, c.title as course_title,
                (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
                es.id as submission_id, es.status as submission_status, es.score, es.percentage, es.passed, es.feedback, es.submitted_at
         FROM exams e
         JOIN enrollments enr ON enr.course_id = e.course_id AND enr.student_id = ?
         JOIN courses c ON e.course_id = c.id
         LEFT JOIN exam_submissions es ON es.exam_id = e.id AND es.student_id = ?
         WHERE e.status IN ('SCHEDULED', 'PUBLISHED')
         ORDER BY e.id DESC`
      )
      .all(student.id, student.id);
    res.json({ exams });
  });

  router.post('/exams', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const courseId = Number(req.body?.courseId);
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const totalMarks = Number(req.body?.totalMarks ?? 20);
    const passingMarks = Number(req.body?.passingMarks ?? 12);
    const durationMins = Number(req.body?.durationMins ?? 15);
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];

    if (!courseId || !title || questions.length === 0) {
      res.status(400).json({ error: 'Course, title, and at least one MCQ question are required.' });
      return;
    }

    let mentorId: number | null = null;
    if (req.user!.role === 'MENTOR') {
      mentorId = getMentorIdForUser(req.user!.sub);
      if (!mentorId || !isMentorAssignedToCourse(mentorId, courseId)) {
        res.status(403).json({ error: 'Mentors can only create exams for assigned courses.' });
        return;
      }
    } else {
      const cRow = db.prepare('SELECT mentor_id FROM courses WHERE id = ?').get(courseId) as { mentor_id: number | null } | undefined;
      mentorId = cRow?.mentor_id ?? 1;
    }

    db.exec('BEGIN');
    try {
      const exRes = db
        .prepare(
          `INSERT INTO exams (course_id, mentor_id, title, description, total_marks, passing_marks, duration_mins, scheduled_at, results_published, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, 'PUBLISHED')`
        )
        .run(courseId, mentorId, title, description, totalMarks, passingMarks, durationMins);
      const examId = Number(exRes.lastInsertRowid);

      const insQ = db.prepare('INSERT INTO questions (exam_id, question_text, marks, explanation, sort_order) VALUES (?, ?, ?, ?, ?)');
      const insO = db.prepare('INSERT INTO exam_options (question_id, option_text, is_correct) VALUES (?, ?, ?)');

      questions.forEach((q: { text: string; marks?: number; explanation?: string; options: Array<{ text: string; isCorrect: boolean }> }, idx: number) => {
        const qRes = insQ.run(examId, String(q.text), Number(q.marks ?? 5), String(q.explanation ?? ''), idx + 1);
        const qId = Number(qRes.lastInsertRowid);
        (q.options || []).forEach((o) => {
          insO.run(qId, String(o.text), o.isCorrect ? 1 : 0);
        });
      });

      db.exec('COMMIT');
      logAudit(req.user, 'EXAM_CREATED', 'EXAM', examId, title, req.ip);
      res.status(201).json({ id: examId });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to create exam paper.' });
    }
  });

  router.patch('/exams/:id/publish', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare("UPDATE exams SET results_published = 1, status = 'PUBLISHED' WHERE id = ?").run(id);
    res.json({ published: true });
  });

  router.post('/exams/:id/start', requireAuth, requireRole('STUDENT'), (req: AuthedRequest, res) => {
    const examId = Number(req.params.id);
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as
      | { id: number; course_id: number; title: string; duration_mins: number; total_marks: number; passing_marks: number }
      | undefined;
    if (!exam || !isStudentEnrolled(student.id, exam.course_id)) {
      res.status(403).json({ error: 'You are not enrolled in the course for this examination.' });
      return;
    }

    let submission = db.prepare('SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?').get(examId, student.id) as
      | { id: number; status: string; started_at: string }
      | undefined;

    if (submission && submission.status !== 'IN_PROGRESS') {
      res.status(409).json({ error: 'You have already submitted this examination.' });
      return;
    }

    if (!submission) {
      const subRes = db
        .prepare("INSERT INTO exam_submissions (exam_id, student_id, total_marks, status) VALUES (?, ?, ?, 'IN_PROGRESS')")
        .run(examId, student.id, exam.total_marks);
      submission = { id: Number(subRes.lastInsertRowid), status: 'IN_PROGRESS', started_at: new Date().toISOString() };
    }

    // IMPORTANT: Never expose is_correct to the student during examination!
    const questions = db
      .prepare('SELECT id, question_text, marks, sort_order FROM questions WHERE exam_id = ? ORDER BY sort_order ASC')
      .all(examId)
      .map((q: Record<string, unknown>) => ({
        ...q,
        options: db.prepare('SELECT id, option_text FROM exam_options WHERE question_id = ?').all(Number(q.id)),
      }));

    res.json({ exam, submissionId: submission.id, questions });
  });

  router.post('/exams/:id/submit', requireAuth, requireRole('STUDENT'), (req: AuthedRequest, res) => {
    const examId = Number(req.params.id);
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const submission = db
      .prepare('SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?')
      .get(examId, student.id) as { id: number; status: string } | undefined;

    if (!submission || submission.status !== 'IN_PROGRESS') {
      res.status(400).json({ error: 'No active examination attempt found.' });
      return;
    }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as { id: number; passing_marks: number };
    const answersMap: Record<string, number> = req.body?.answers || {};
    const autoSubmitted = Boolean(req.body?.autoSubmitted);

    const questions = db.prepare('SELECT id, marks FROM questions WHERE exam_id = ?').all(examId) as Array<{ id: number; marks: number }>;

    let score = 0;
    let totalMarks = 0;

    const insAns = db.prepare(
      'INSERT INTO exam_answers (submission_id, question_id, selected_option_id, is_correct, marks_awarded) VALUES (?, ?, ?, ?, ?)'
    );

    db.exec('BEGIN');
    try {
      for (const q of questions) {
        totalMarks += q.marks;
        const selectedOptionId = answersMap[String(q.id)] ? Number(answersMap[String(q.id)]) : null;
        let isCorrect = 0;
        if (selectedOptionId) {
          const opt = db
            .prepare('SELECT is_correct FROM exam_options WHERE id = ? AND question_id = ?')
            .get(selectedOptionId, q.id) as { is_correct: number } | undefined;
          isCorrect = opt?.is_correct === 1 ? 1 : 0;
        }
        const awarded = isCorrect ? q.marks : 0;
        score += awarded;
        insAns.run(submission.id, q.id, selectedOptionId, isCorrect, awarded);
      }

      const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(2)) : 0;
      const passed = score >= exam.passing_marks ? 1 : 0;
      const feedback = passed
        ? 'Competency benchmark achieved. Review trade sizing explanations for precision.'
        : 'Score below passing threshold. Review study materials and consult your mentor.';

      db.prepare(
        `UPDATE exam_submissions
         SET submitted_at = datetime('now'), auto_submitted = ?, score = ?, total_marks = ?, percentage = ?, passed = ?, feedback = ?, status = 'GRADED'
         WHERE id = ?`
      ).run(autoSubmitted ? 1 : 0, score, totalMarks, percentage, passed, feedback, submission.id);

      db.exec('COMMIT');
      res.json({ submitted: true, score, totalMarks, percentage, passed: passed === 1, feedback });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'Unable to grade examination.' });
    }
  });

  // =========================================================================
  // 7. DOUBT SUPPORT, NOTIFICATIONS, REFERRALS & STUDENT DASHBOARD
  // =========================================================================

  router.get('/doubts', requireAuth, (req: AuthedRequest, res) => {
    let doubts: Array<Record<string, unknown>> = [];
    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }
      doubts = db
        .prepare(
          `SELECT sd.*, c.title as course_title FROM student_doubts sd
           JOIN courses c ON sd.course_id = c.id WHERE sd.student_id = ? ORDER BY sd.id DESC`
        )
        .all(student.id) as Array<Record<string, unknown>>;
    } else if (req.user!.role === 'MENTOR') {
      const mentorId = getMentorIdForUser(req.user!.sub);
      doubts = db
        .prepare(
          `SELECT sd.*, c.title as course_title, s.full_name as student_name, s.student_id_code
           FROM student_doubts sd
           JOIN courses c ON sd.course_id = c.id
           JOIN students s ON sd.student_id = s.id
           WHERE c.mentor_id = ? ORDER BY sd.id DESC`
        )
        .all(mentorId) as Array<Record<string, unknown>>;
    } else {
      doubts = db
        .prepare(
          `SELECT sd.*, c.title as course_title, s.full_name as student_name, s.student_id_code
           FROM student_doubts sd
           JOIN courses c ON sd.course_id = c.id
           JOIN students s ON sd.student_id = s.id
           ORDER BY sd.id DESC`
        )
        .all() as Array<Record<string, unknown>>;
    }

    const withReplies = doubts.map((d) => ({
      ...d,
      replies: db.prepare('SELECT * FROM doubt_replies WHERE doubt_id = ? ORDER BY id ASC').all(Number(d.id)),
    }));
    res.json({ doubts: withReplies });
  });

  router.post('/doubts', requireAuth, requireRole('STUDENT'), (req: AuthedRequest, res) => {
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const courseId = Number(req.body?.courseId);
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();

    if (!courseId || !title || !description || !isStudentEnrolled(student.id, courseId)) {
      res.status(400).json({ error: 'Valid enrolled course, title, and question description are required.' });
      return;
    }

    const course = db.prepare('SELECT mentor_id FROM courses WHERE id = ?').get(courseId) as { mentor_id: number | null } | undefined;
    const r = db
      .prepare(
        `INSERT INTO student_doubts (student_id, course_id, mentor_id, title, description, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`
      )
      .run(student.id, courseId, course?.mentor_id ?? null, title, description);

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.post('/doubts/:id/reply', requireAuth, (req: AuthedRequest, res) => {
    const doubtId = Number(req.params.id);
    const message = String(req.body?.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Reply message cannot be empty.' });
      return;
    }
    const doubt = db.prepare('SELECT * FROM student_doubts WHERE id = ?').get(doubtId) as
      | { id: number; student_id: number; course_id: number }
      | undefined;
    if (!doubt) {
      res.status(404).json({ error: 'Doubt thread not found' });
      return;
    }
    if (req.user!.role === 'STUDENT') {
      const student = getStudentForUser(req.user!.sub);
      if (!student || student.id !== doubt.student_id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }
    const userRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user!.sub) as { full_name: string };
    db.prepare('INSERT INTO doubt_replies (doubt_id, user_id, author_name, author_role, message) VALUES (?, ?, ?, ?, ?)').run(
      doubtId,
      req.user!.sub,
      userRow.full_name,
      req.user!.role,
      message
    );
    const nextStatus = req.user!.role === 'STUDENT' ? 'IN_PROGRESS' : 'ANSWERED';
    db.prepare("UPDATE student_doubts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, doubtId);
    res.status(201).json({ replied: true });
  });

  router.patch('/doubts/:id/status', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const doubtId = Number(req.params.id);
    const status = String(req.body?.status ?? 'RESOLVED').toUpperCase();
    if (!['PENDING', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    db.prepare("UPDATE student_doubts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, doubtId);
    res.json({ updated: true, status });
  });

  // Notifications
  router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const notifications = db
      .prepare(
        `SELECT n.*, c.title as course_title,
                CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END as is_read
         FROM notifications n
         LEFT JOIN courses c ON n.course_id = c.id
         LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
         WHERE n.target_role = 'ALL' OR n.target_role = ? OR ? = 'ADMIN'
         ORDER BY n.id DESC LIMIT 30`
      )
      .all(req.user!.sub, req.user!.role, req.user!.role);
    res.json({ notifications });
  });

  router.post('/notifications', requireAuth, requireRole('ADMIN', 'MENTOR'), (req: AuthedRequest, res) => {
    const title = String(req.body?.title ?? '').trim();
    const message = String(req.body?.message ?? '').trim();
    const category = String(req.body?.category ?? 'Announcement').trim();
    const targetRole = String(req.body?.targetRole ?? 'ALL').toUpperCase();
    const courseId = req.body?.courseId ? Number(req.body.courseId) : null;

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required.' });
      return;
    }
    const r = db
      .prepare('INSERT INTO notifications (title, message, category, target_role, course_id, sender_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(title, message, category, targetRole, courseId, req.user!.sub);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)').run(Number(req.params.id), req.user!.sub);
    res.json({ read: true });
  });

  // Student Comprehensive Dashboard & Referrals
  router.get('/student/dashboard', requireAuth, requireRole('STUDENT'), (req: AuthedRequest, res) => {
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const enrollments = db
      .prepare(
        `SELECT e.*, c.title as course_title, c.duration, c.discounted_fees, c.image_url, u.full_name as mentor_name
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         LEFT JOIN mentors m ON c.mentor_id = m.id
         LEFT JOIN users u ON m.user_id = u.id
         WHERE e.student_id = ?`
      )
      .all(student.id) as Array<Record<string, unknown>>;

    const totalCourseFees = enrollments.reduce((acc, e) => acc + Number(e.discounted_fees || 0), 0);
    const feesPaid = (
      db.prepare("SELECT coalesce(SUM(amount), 0) as s FROM payments WHERE student_id = ? AND status = 'VERIFIED'").get(student.id) as { s: number }
    ).s;
    const remainingFees = Math.max(0, Number((totalCourseFees - feesPaid).toFixed(2)));

    const receipts = db.prepare('SELECT * FROM payment_receipts WHERE student_id = ? ORDER BY id DESC').all(student.id);
    const attendanceRows = db.prepare('SELECT status FROM attendance WHERE student_id = ?').all(student.id) as Array<{ status: string }>;
    const attendancePct =
      attendanceRows.length > 0
        ? Math.round((attendanceRows.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length / attendanceRows.length) * 100)
        : 100;

    const referrals = db
      .prepare(
        `SELECT r.*, rr.reward_amount, rr.reward_status
         FROM referrals r LEFT JOIN referral_rewards rr ON rr.referral_id = r.id
         WHERE r.referrer_student_id = ? ORDER BY r.id DESC`
      )
      .all(student.id);
    const referralSettings = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get();
    const brokers = db.prepare('SELECT * FROM brokers WHERE is_active = 1').all();

    res.json({
      student,
      enrollments,
      fees: { totalCourseFees, feesPaid, remainingFees },
      receipts,
      attendancePct,
      referrals,
      referralSettings,
      brokers,
    });
  });

  router.post('/student/referrals', requireAuth, requireRole('STUDENT'), (req: AuthedRequest, res) => {
    const student = getStudentForUser(req.user!.sub);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const referredName = String(req.body?.referredName ?? '').trim();
    const referredEmail = String(req.body?.referredEmail ?? '').trim().toLowerCase();
    if (!referredName || !referredEmail.includes('@')) {
      res.status(400).json({ error: 'Valid name and email are required for referral tracking.' });
      return;
    }
    const r = db
      .prepare("INSERT INTO referrals (referrer_student_id, referred_email, referred_name, status) VALUES (?, ?, ?, 'PENDING')")
      .run(student.id, referredEmail, referredName);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  return router;
}
