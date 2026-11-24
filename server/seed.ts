import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './db.ts';

function ensureSampleMaterialFile(fileName: string, title: string, body: string): { filePath: string; fileSize: number } {
  const fullPath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(fullPath)) {
    const content = `%PDF-1.4\n% Aurelia FX Academy Study Resource\n${title}\n========================================\n\n${body}\n`;
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  const stat = fs.statSync(fullPath);
  return { filePath: fileName, fileSize: stat.size };
}

export function seedInitialData(): void {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM courses').get() as { cnt: number };
  if (existing.cnt > 0) return;

  db.prepare(`INSERT OR IGNORE INTO referral_settings (id, reward_amount, terms) VALUES (1, 100, ?)`).run(
    'Qualifying referral requires verified admission approval and initial tuition payment clearance. Rewards require Admin review prior to disbursement.'
  );

  // 1. Seed 2 Mentor accounts (credential pending until Admin issues password)
  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, role, full_name, phone, is_active, email_verified, must_change_password)
    VALUES (?, ?, '!CREDENTIAL_PENDING', ?, ?, ?, 1, 1, 1)
  `);

  const m1User = insertUser.run('julian.vance', 'julian.vance@aureliafx.edu', 'MENTOR', 'Julian Vance', '+1-212-555-0141');
  const m2User = insertUser.run('elena.rostova', 'elena.rostova@aureliafx.edu', 'MENTOR', 'Elena Rostova', '+44-20-7946-0921');

  const insertMentor = db.prepare(`
    INSERT INTO mentors (user_id, mentor_code, specialization, experience_years, qualification, bio, avatar_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const m1 = insertMentor.run(
    Number(m1User.lastInsertRowid),
    'MNT-101',
    'Institutional Price Action & Liquidity Structure',
    14,
    'CFA Charterholder, Former FX Desk Strategist',
    'Fourteen years structuring G10 spot execution desks in London and New York, specializing in multi-timeframe liquidity sweeps and disciplined risk sizing.',
    '/src/assets/images/mentor_portrait_male_1795518344158.jpg'
  );

  const m2 = insertMentor.run(
    Number(m2User.lastInsertRowid),
    'MNT-102',
    'Central Bank Macroeconomics & Quantitative Technicals',
    11,
    'MSc Quantitative Finance, LSE',
    'Former macro currency analyst covering G7 monetary policy cycles, rate differentials, and systematic technical confluence models.',
    '/src/assets/images/mentor_portrait_female_1795518345593.jpg'
  );

  const mentor1Id = Number(m1.lastInsertRowid);
  const mentor2Id = Number(m2.lastInsertRowid);

  // 2. Seed 5 Default Trading Courses
  const coursesData = [
    {
      slug: 'forex-trading-beginner-course',
      title: 'Forex Trading Beginner Course',
      description: 'Foundational curriculum covering global currency market mechanics, pip valuation, lot sizing, session overlaps, and structured risk management.',
      image_url: '/src/assets/images/course_forex_beginner_1795518344034.jpg',
      duration: '6 Weeks',
      fees: 650,
      discounted_fees: 540,
      mentor_id: mentor1Id,
      syllabus: [
        'Module 1: Interbank Currency Structure & Major Pairs',
        'Module 2: Pips, Spreads, Margin & Position Sizing Math',
        'Module 3: London, New York & Tokyo Session Liquidity',
        'Module 4: Order Types, Slippage & Execution Discipline',
        'Module 5: Trading Journal & Risk-per-Trade Protocols',
      ],
      outcomes: [
        'Calculate exact lot sizes for fixed 0.5%-1% portfolio risk',
        'Navigate MT5/TradingView order execution without slippage errors',
        'Build a verifiable 30-trade demo performance journal',
      ],
    },
    {
      slug: 'technical-analysis-course',
      title: 'Technical Analysis Course',
      description: 'Precision charting methodology focusing on market structure, multi-timeframe alignment, Fibonacci confluence, and statistical momentum indicators.',
      image_url: '/src/assets/images/course_technical_analysis_1795518345063.jpg',
      duration: '8 Weeks',
      fees: 850,
      discounted_fees: 720,
      mentor_id: mentor1Id,
      syllabus: [
        'Module 1: Swing High/Low Structure & Break of Structure',
        'Module 2: Dynamic Support, Resistance & Supply Zones',
        'Module 3: Multi-Timeframe Top-Down Charting Workflow',
        'Module 4: RSI Divergence, ATR Volatility & Moving Averages',
        'Module 5: Historical Backtesting & Expectancy Metrics',
      ],
      outcomes: [
        'Construct objective top-down chart plans across D1, H4, and H1',
        'Filter low-probability consolidations using ATR volatility bands',
        'Measure system win-rate and R-multiple expectancy statistically',
      ],
    },
    {
      slug: 'fundamental-analysis-course',
      title: 'Fundamental Analysis Course',
      description: 'Macroeconomic framework analyzing central bank rate decisions, CPI/NFP releases, bond yield spreads, and cross-asset currency flows.',
      image_url: '/src/assets/images/hero_trading_desk_1795518343915.jpg',
      duration: '8 Weeks',
      fees: 900,
      discounted_fees: 760,
      mentor_id: mentor2Id,
      syllabus: [
        'Module 1: Federal Reserve, ECB, BoE & BoJ Policy Mandates',
        'Module 2: Inflation, Employment & GDP Surprise Matrices',
        'Module 3: Sovereign 2Y/10Y Yield Differentials & Carry Flows',
        'Module 4: Event Risk Protocols & Pre-News Spread Defense',
        'Module 5: Building a Weekly Macro Bias Brief',
      ],
      outcomes: [
        'Interpret central bank policy statements for directional currency bias',
        'Track real-yield spreads to anticipate institutional capital rotation',
        'Manage exposure cleanly ahead of tier-one economic releases',
      ],
    },
    {
      slug: 'advanced-price-action-course',
      title: 'Advanced Price Action Course',
      description: 'Deep-dive study into institutional order flow, liquidity pools, inducement traps, session open manipulation, and precision entry refinement.',
      image_url: '/src/assets/images/course_technical_analysis_1795518345063.jpg',
      duration: '10 Weeks',
      fees: 1200,
      discounted_fees: 990,
      mentor_id: mentor1Id,
      syllabus: [
        'Module 1: Institutional Liquidity Pools & Stop Runs',
        'Module 2: Order Blocks, Fair Value Gaps & Mitigation',
        'Module 3: Killzone Timing & Intraday Reversal Profiles',
        'Module 4: Scaling In, Partial Take-Profits & Trailing Logic',
        'Module 5: Live Desk Tape Reading & Trade Reviews',
      ],
      outcomes: [
        'Identify high-probability liquidity sweeps during London/NY opens',
        'Execute refined M15/M5 entries aligned with H4 institutional flow',
        'Maintain disciplined drawdown caps under live market conditions',
      ],
    },
    {
      slug: 'professional-forex-trading-course',
      title: 'Professional Forex Trading Course',
      description: 'Comprehensive capstone track integrating macro fundamentals, institutional price action, portfolio correlation, and live evaluation.',
      image_url: '/src/assets/images/hero_trading_desk_1795518343915.jpg',
      duration: '14 Weeks',
      fees: 1650,
      discounted_fees: 1380,
      mentor_id: mentor2Id,
      syllabus: [
        'Module 1: Macro-Technical Synthesis & Currency Basket Selection',
        'Module 2: Portfolio Correlation & Exposure Netting',
        'Module 3: Drawdown Recovery & Psychological Capital Control',
        'Module 4: Quantitative Performance Auditing & Trade Metrics',
        'Module 5: Capstone Live Market Simulation & Oral Review',
      ],
      outcomes: [
        'Operate a complete multi-pair macro-technical trading desk plan',
        'Control correlated USD/JPY/EUR risk across simultaneous positions',
        'Pass the Academy Capstone Practical & Quantitative Examination',
      ],
    },
  ];

  const insertCourse = db.prepare(`
    INSERT INTO courses (slug, title, description, image_url, duration, fees, discounted_fees, syllabus_json, outcomes_json, status, mentor_id, pdf_material_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `);
  const insertFeeStructure = db.prepare(`
    INSERT INTO fee_structures (course_id, total_fee, installment_allowed, max_installments, due_days)
    VALUES (?, ?, 1, 3, 30)
  `);

  const courseIds: number[] = [];
  for (const c of coursesData) {
    const res = insertCourse.run(
      c.slug,
      c.title,
      c.description,
      c.image_url,
      c.duration,
      c.fees,
      c.discounted_fees,
      JSON.stringify(c.syllabus),
      JSON.stringify(c.outcomes),
      c.mentor_id,
      `/api/courses/${c.slug}/syllabus-pdf`
    );
    const cid = Number(res.lastInsertRowid);
    courseIds.push(cid);
    insertFeeStructure.run(cid, c.discounted_fees);
  }

  // 3. Seed Sample Students + Admissions + Enrollments + Verified Payments + Receipts
  const sampleStudents = [
    { name: 'Aarav Mehta', email: 'aarav.mehta@student.aureliafx.edu', mobile: '+1-415-555-0182', city: 'New York, NY', courseIdx: 0, paid: 540, status: 'PAID', daysAgo: 22 },
    { name: 'Sophia Lindqvist', email: 'sophia.l@student.aureliafx.edu', mobile: '+44-20-7946-0334', city: 'London, UK', courseIdx: 1, paid: 400, status: 'PARTIAL', daysAgo: 14 },
    { name: 'Daniel Okafor', email: 'daniel.okafor@student.aureliafx.edu', mobile: '+1-312-555-0194', city: 'Chicago, IL', courseIdx: 2, paid: 760, status: 'PAID', daysAgo: 9 },
    { name: 'Claire Beaumont', email: 'claire.b@student.aureliafx.edu', mobile: '+33-1-42-68-55-01', city: 'Paris, FR', courseIdx: 3, paid: 500, status: 'PARTIAL', daysAgo: 4 },
    { name: 'Marcus Chen', email: 'marcus.chen@student.aureliafx.edu', mobile: '+65-6555-0128', city: 'Singapore', courseIdx: 4, paid: 1380, status: 'PAID', daysAgo: 1 },
  ];

  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, student_id_code, full_name, email, mobile, address, date_of_birth, referral_code, status)
    VALUES (?, ?, ?, ?, ?, ?, '1998-06-15', ?, 'ACTIVE')
  `);
  const insertAdmission = db.prepare(`
    INSERT INTO admissions (admission_no, full_name, email, mobile, address, date_of_birth, course_id, admission_date, course_duration, total_fees, discount, final_fees, payment_status, meeting_date, meeting_time, meeting_reason, remarks, status, student_id)
    VALUES (?, ?, ?, ?, ?, '1998-06-15', ?, ?, ?, ?, ?, ?, ?, ?, '10:30', 'Cohort orientation & desk assessment', 'Approved cohort admission', 'APPROVED', ?)
  `);
  const insertEnrollment = db.prepare(`
    INSERT INTO enrollments (student_id, course_id, admission_id, enrolled_at, progress_pct, status)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments (student_id, enrollment_id, course_id, amount, discount_applied, payment_method, payment_mode, gateway_order_id, gateway_payment_id, gateway_signature, status, due_date, paid_at, verified_by_server, notes)
    VALUES (?, ?, ?, ?, ?, 'RAZORPAY', ?, ?, ?, 'verified_seed_sig', 'VERIFIED', date('now', '+30 days'), ?, 1, 'Initial cohort tuition clearance')
  `);
  const insertReceipt = db.prepare(`
    INSERT INTO payment_receipts (receipt_number, payment_id, student_id, student_code, student_name, course_name, payment_amount, remaining_balance, payment_method, reference_id, payment_status, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RAZORPAY', ?, 'VERIFIED', ?)
  `);

  const studentIds: number[] = [];
  sampleStudents.forEach((s, idx) => {
    const course = coursesData[s.courseIdx];
    const cid = courseIds[s.courseIdx];
    const uname = s.email.split('@')[0];
    const uRes = insertUser.run(uname, s.email, 'STUDENT', s.name, s.mobile);
    const uid = Number(uRes.lastInsertRowid);
    const code = `FXA-2026-000${idx + 1}`;
    const refCode = `REF-FXA-${1001 + idx}`;
    const stRes = insertStudent.run(uid, code, s.name, s.email, s.mobile, s.city, refCode);
    const stId = Number(stRes.lastInsertRowid);
    studentIds.push(stId);

    const dateRow = db.prepare(`SELECT date('now', ?) as d, datetime('now', ?) as dt`).get(`-${s.daysAgo} days`, `-${s.daysAgo} days`) as { d: string; dt: string };
    const admRes = insertAdmission.run(
      `ADM-2026-00${idx + 1}`,
      s.name,
      s.email,
      s.mobile,
      s.city,
      cid,
      dateRow.d,
      course.duration,
      course.fees,
      course.fees - course.discounted_fees,
      course.discounted_fees,
      s.status,
      dateRow.d,
      stId
    );
    const admId = Number(admRes.lastInsertRowid);
    const enrRes = insertEnrollment.run(stId, cid, admId, dateRow.dt, 35 + idx * 12);
    const enrId = Number(enrRes.lastInsertRowid);

    const orderId = `order_seed_${1000 + idx}`;
    const payId = `pay_seed_${9000 + idx}`;
    const pRes = insertPayment.run(
      stId,
      enrId,
      cid,
      s.paid,
      course.fees - course.discounted_fees,
      s.paid >= course.discounted_fees ? 'FULL' : 'PARTIAL',
      orderId,
      payId,
      dateRow.dt
    );
    const paymentId = Number(pRes.lastInsertRowid);
    const remaining = Math.max(0, course.discounted_fees - s.paid);
    insertReceipt.run(
      `RCPT-2026-000${idx + 1}`,
      paymentId,
      stId,
      code,
      s.name,
      course.title,
      s.paid,
      remaining,
      payId,
      dateRow.dt
    );
  });

  // Add 2 Pending Admissions for Admin review
  db.prepare(`
    INSERT INTO admissions (admission_no, full_name, email, mobile, address, date_of_birth, course_id, admission_date, course_duration, total_fees, discount, final_fees, payment_status, meeting_date, meeting_time, meeting_reason, remarks, status)
    VALUES
    ('ADM-2026-006', 'Nadia Al-Mansoor', 'nadia.m@prospect.org', '+971-50-555-0199', 'Dubai, UAE', '1997-11-04', ?, date('now'), '10 Weeks', 1200, 210, 990, 'PENDING', date('now', '+2 days'), '14:00', 'Evaluate prerequisite charting background', 'Requested evening London-overlap batch', 'PENDING'),
    ('ADM-2026-007', 'Lucas Ferreira', 'lucas.f@prospect.org', '+55-11-95555-0144', 'Sao Paulo, BR', '1999-03-19', ?, date('now'), '6 Weeks', 650, 110, 540, 'PENDING', date('now', '+3 days'), '16:30', 'Tuition installment schedule review', 'New to spot FX markets', 'PENDING')
  `).run(courseIds[3], courseIds[0]);

  // 4. Offers & Discounts
  db.prepare(`
    INSERT INTO offers (title, description, badge_text, valid_until, is_active) VALUES
    ('Seasonal Institutional Cohort Grant', 'Reduced tuition across all five structured FX tracks for upcoming quarterly admissions.', 'Cohort Grant', '2026-12-31', 1),
    ('Dual-Track Progression Credit', 'Enrolled beginner students receive priority fee reduction when advancing to Price Action.', 'Alumni Credit', '2026-12-31', 1)
  `).run();

  db.prepare(`
    INSERT INTO discounts (code, title, discount_type, value, valid_until, is_active) VALUES
    ('AURELIA10', 'Institutional Early Enrollment 10% Off', 'PERCENT', 10, '2026-12-31', 1),
    ('FXGRANT150', 'Flat $150 Cohort Scholarship', 'FLAT', 150, '2026-12-31', 1)
  `).run();

  // 5. Live Classes & Recordings
  const lc1 = db.prepare(`
    INSERT INTO live_classes (course_id, mentor_id, title, description, class_date, start_time, duration_mins, meeting_platform, meeting_link, status)
    VALUES (?, ?, 'London Session Liquidity & Pip Math Lab', 'Live chart walkthrough of EUR/USD and GBP/USD London open execution structure.', date('now', '+1 day'), '09:00', 75, 'ZOOM', 'https://zoom.us/j/98412039411', 'SCHEDULED')
  `).run(courseIds[0], mentor1Id);

  db.prepare(`
    INSERT INTO live_classes (course_id, mentor_id, title, description, class_date, start_time, duration_mins, meeting_platform, meeting_link, status)
    VALUES
    (?, ?, 'Multi-Timeframe Supply & Structure Drill', 'Aligning D1 directional bias with H1 execution setups.', date('now', '+2 days'), '14:00', 90, 'GOOGLE_MEET', 'https://meet.google.com/afx-desk-chart', 'SCHEDULED'),
    (?, ?, 'FOMC Rate Cycle & Yield Spread Workshop', 'Decoding central bank dot plots and US2Y vs DE2Y yield spreads.', date('now', '+3 days'), '17:30', 60, 'ZOOM', 'https://zoom.us/j/91204918234', 'SCHEDULED'),
    (?, ?, 'Foundations of Position Sizing (Recorded)', 'Completed session covering fixed fractional risk and stop distance formulas.', date('now', '-3 days'), '10:00', 65, 'ZOOM', 'https://zoom.us/j/90112233445', 'COMPLETED')
  `).run(courseIds[1], mentor1Id, courseIds[2], mentor2Id, courseIds[0], mentor1Id);

  db.prepare(`
    INSERT INTO class_recordings (live_class_id, course_id, title, recording_url, duration_label)
    VALUES (?, ?, 'Foundations of Position Sizing — Full Session Replay', 'https://zoom.us/rec/share/aurelia-fx-session-01', '65 mins')
  `).run(Number(lc1.lastInsertRowid) + 3, courseIds[0]);

  // 6. Study Materials (real files on disk)
  const mat1 = ensureSampleMaterialFile(
    'fx_risk_sizing_handbook.pdf',
    'Aurelia FX Academy — Position Sizing & Risk Protocol',
    '1. Never risk more than 1.0% of account equity on a single currency trade.\n2. Lot Size = (Account Equity * Risk %) / (Stop Loss Pips * Pip Value).\n3. Avoid stacking correlated USD exposure across EUR/USD, GBP/USD, and AUD/USD simultaneously.'
  );
  const mat2 = ensureSampleMaterialFile(
    'market_structure_playbook.pdf',
    'Aurelia FX Academy — Multi-Timeframe Structure Playbook',
    '1. Establish higher-timeframe bias on D1 and H4.\n2. Mark unmitigated supply/demand zones and clean swing liquidity.\n3. Wait for Break of Structure (BOS) confirmation before placing limit orders.'
  );
  const mat3 = ensureSampleMaterialFile(
    'central_bank_calendar_guide.pdf',
    'Aurelia FX Academy — Central Bank Policy & Yield Differentials',
    '1. Track CPI, Core PCE, NFP, and PMI releases against consensus forecasts.\n2. Compare 2-year sovereign bond yield spreads to anticipate institutional FX capital flows.'
  );

  db.prepare(`
    INSERT INTO study_materials (course_id, mentor_id, title, category, description, file_name, file_path, file_size, mime_type, downloadable)
    VALUES
    (?, ?, 'Position Sizing & Risk Protocol Handbook', 'PDF_NOTES', 'Standardized lot-sizing worksheets and drawdown control tables.', 'fx_risk_sizing_handbook.pdf', ?, ?, 'application/pdf', 1),
    (?, ?, 'Multi-Timeframe Market Structure Playbook', 'TRADING_STRATEGY', 'Annotated H4/H1 liquidity and break-of-structure reference sheets.', 'market_structure_playbook.pdf', ?, ?, 'application/pdf', 1),
    (?, ?, 'Central Bank Policy & Yield Differential Guide', 'FUNDAMENTAL_DOC', 'Macro framework for evaluating G7 monetary policy cycles.', 'central_bank_calendar_guide.pdf', ?, ?, 'application/pdf', 1)
  `).run(
    courseIds[0], mentor1Id, mat1.filePath, mat1.fileSize,
    courseIds[1], mentor1Id, mat2.filePath, mat2.fileSize,
    courseIds[2], mentor2Id, mat3.filePath, mat3.fileSize
  );

  // 7. Attendance records
  db.prepare(`
    INSERT INTO attendance (student_id, course_id, mentor_id, attendance_date, status, remarks)
    VALUES
    (?, ?, ?, date('now', '-4 days'), 'PRESENT', 'Active chart participation'),
    (?, ?, ?, date('now', '-2 days'), 'PRESENT', 'On time'),
    (?, ?, ?, date('now', '-1 day'), 'LATE', 'Joined 10 mins after London open brief'),
    (?, ?, ?, date('now', '-2 days'), 'PRESENT', 'Submitted technical drill'),
    (?, ?, ?, date('now', '-1 day'), 'ABSENT', 'Notified mentor ahead of session')
  `).run(
    studentIds[0], courseIds[0], mentor1Id,
    studentIds[0], courseIds[0], mentor1Id,
    studentIds[0], courseIds[0], mentor1Id,
    studentIds[1], courseIds[1], mentor1Id,
    studentIds[1], courseIds[1], mentor1Id
  );

  // 8. Online Exams + Questions + Options
  const ex1 = db.prepare(`
    INSERT INTO exams (course_id, mentor_id, title, description, total_marks, passing_marks, duration_mins, scheduled_at, results_published, status)
    VALUES (?, ?, 'Forex Foundations & Risk Assessment Exam', 'Evaluates pip math, lot sizing, margin mechanics, and session liquidity.', 20, 12, 15, datetime('now'), 1, 'PUBLISHED')
  `).run(courseIds[0], mentor1Id);
  const exam1Id = Number(ex1.lastInsertRowid);

  const examQuestions = [
    {
      text: 'On a standard EUR/USD account (100,000 units per standard lot), what is the approximate pip value per 1.00 standard lot?',
      marks: 5,
      explanation: 'For USD-quoted pairs like EUR/USD, 1 pip (0.0001) on 100,000 units equals $10 USD.',
      options: [
        { text: '$1.00 per pip', correct: 0 },
        { text: '$10.00 per pip', correct: 1 },
        { text: '$100.00 per pip', correct: 0 },
        { text: '$0.10 per pip', correct: 0 },
      ],
    },
    {
      text: 'With a $10,000 account and a strict 1% risk limit ($100), what position size should you take on EUR/USD with a 25-pip stop loss?',
      marks: 5,
      explanation: '0.40 lots yields $4/pip; 25 pips * $4/pip = $100 maximum risk.',
      options: [
        { text: '0.40 lots', correct: 1 },
        { text: '1.00 lot', correct: 0 },
        { text: '0.10 lots', correct: 0 },
        { text: '2.50 lots', correct: 0 },
      ],
    },
    {
      text: 'Which trading window consistently provides the tightest spreads and highest spot FX liquidity?',
      marks: 5,
      explanation: 'The London–New York session overlap concentrates European and North American institutional order flow.',
      options: [
        { text: 'Sydney market close', correct: 0 },
        { text: 'London and New York session overlap', correct: 1 },
        { text: 'Sunday midnight market open', correct: 0 },
        { text: 'Late Friday afternoon', correct: 0 },
      ],
    },
    {
      text: 'What is the primary function of an ATR (Average True Range) indicator in trade planning?',
      marks: 5,
      explanation: 'ATR measures historical price volatility range to calibrate realistic stop-loss and target distances.',
      options: [
        { text: 'Predicting central bank interest rate hikes', correct: 0 },
        { text: 'Measuring market volatility to size stops objectively', correct: 1 },
        { text: 'Calculating broker swap commissions', correct: 0 },
        { text: 'Guaranteeing winning breakout trades', correct: 0 },
      ],
    },
  ];

  const insQ = db.prepare(`INSERT INTO questions (exam_id, question_text, marks, explanation, sort_order) VALUES (?, ?, ?, ?, ?)`);
  const insOpt = db.prepare(`INSERT INTO exam_options (question_id, option_text, is_correct) VALUES (?, ?, ?)`);

  examQuestions.forEach((q, idx) => {
    const qRes = insQ.run(exam1Id, q.text, q.marks, q.explanation, idx + 1);
    const qid = Number(qRes.lastInsertRowid);
    q.options.forEach((o) => insOpt.run(qid, o.text, o.correct));
  });

  // 9. Notifications
  db.prepare(`
    INSERT INTO notifications (title, message, category, target_role, course_id)
    VALUES
    ('Q2 Institutional Cohort Schedule Published', 'Live London and New York desk sessions are now active inside your Live Classes portal.', 'Class Schedule Updated', 'ALL', NULL),
    ('New Position Sizing PDF Uploaded', 'Download the updated risk protocol handbook inside Study Materials before Friday lab.', 'New Study Material', 'STUDENT', ?),
    ('Forex Foundations Online Exam Open', 'Enrolled Beginner Course students may complete the 15-minute MCQ assessment.', 'Examination Announced', 'STUDENT', ?)
  `).run(courseIds[0], courseIds[0]);

  // 10. Brokers (with explicit educational & affiliate info)
  db.prepare(`
    INSERT INTO brokers (name, logo_text, description, educational_notes, official_url, partner_url, regulation_info, min_deposit, leverage_info, is_active)
    VALUES
    ('Meridian Prime FX', 'MPFX', 'Multi-regulated execution venue offering raw interbank spreads and institutional depth-of-market feeds for educational simulation and live trading.', 'Suitable for practicing spread sensitivity, limit-order fills, and risk calculation on demo accounts.', 'https://example.com/meridian-prime', 'https://example.com/meridian-prime?partner=aureliafx', 'FCA & ASIC Tier-1 Regulated', '$200 Minimum', 'Up to 1:30 Retail', 1),
    ('Vanguard Currency Clearing', 'VCC', 'Transparent multi-asset broker supporting MetaTrader 5 and cTrader analytical workspaces with historical tick replay.', 'Recommended for structured backtesting and disciplined risk-to-reward execution drills.', 'https://example.com/vanguard-clearing', 'https://example.com/vanguard-clearing?partner=aureliafx', 'CySEC & MAS Regulated', '$100 Minimum', 'Up to 1:30 Retail', 1)
  `).run();

  // 11. Student Doubt
  const d1 = db.prepare(`
    INSERT INTO student_doubts (student_id, course_id, mentor_id, title, description, status)
    VALUES (?, ?, ?, 'Clarifying H4 Order Block vs Liquidity Sweep on EUR/USD', 'When price wicks above a prior H4 swing high during London open and closes back inside the range, should we wait for an M15 BOS before entering?', 'ANSWERED')
  `).run(studentIds[0], courseIds[0], mentor1Id);

  db.prepare(`
    INSERT INTO doubt_replies (doubt_id, user_id, author_name, author_role, message)
    VALUES (?, ?, 'Julian Vance', 'MENTOR', 'Yes—always require an M15 structural shift (body close below the prior minor higher-low) after the sweep. Never short solely on the wick without confirmation.')
  `).run(Number(d1.lastInsertRowid), Number(m1User.lastInsertRowid));

  // 12. Events & Gallery
  const ev1 = db.prepare(`
    INSERT INTO events (title, description, event_date, location, category, status)
    VALUES
    ('Global Macro & Central Bank Outlook Briefing', 'Quarterly live seminar analyzing G7 interest rate trajectories and currency volatility regimes.', date('now', '+12 days'), 'New York Desk & Live Stream', 'Macro Seminar', 'UPCOMING'),
    ('Institutional Risk & Prop Evaluation Workshop', 'Hands-on session covering drawdown recovery math and disciplined trade journaling.', date('now', '+24 days'), 'London Training Floor & Zoom', 'Risk Workshop', 'UPCOMING')
  `).run();

  db.prepare(`
    INSERT INTO gallery (title, image_url, caption, event_id)
    VALUES
    ('Main Trading Academy Hall', '/src/assets/images/hero_trading_desk_1795518343915.jpg', 'Evening cohort desk briefing during the New York–London overlap.', ?),
    ('Technical Structure Lab', '/src/assets/images/course_technical_analysis_1795518345063.jpg', 'Multi-timeframe candlestick geometry and liquidity mapping station.', ?),
    ('Curriculum Blueprint Studio', '/src/assets/images/course_forex_beginner_1795518344034.jpg', 'Printed currency pair correlation matrices and quarterly workbooks.', NULL)
  `).run(Number(ev1.lastInsertRowid), Number(ev1.lastInsertRowid));
}
