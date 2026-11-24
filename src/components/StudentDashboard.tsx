import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Gift,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldAlert,
  User,
  Video,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { downloadReceiptPdf } from '../lib/pdf';
import type {
  AuthUser,
  BrokerItem,
  ClassRecordingItem,
  DoubtItem,
  ExamItem,
  LiveClassItem,
  NotificationItem,
  PaymentItem,
  ReceiptItem,
  StudyMaterialItem,
} from '../types/academy';

interface StudentDashboardProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
  onGoPublic: () => void;
}

type StudentTab =
  | 'dashboard'
  | 'profile'
  | 'courses'
  | 'classes'
  | 'materials'
  | 'exams'
  | 'attendance'
  | 'payments'
  | 'notifications'
  | 'doubts'
  | 'referrals'
  | 'brokers';

export function StudentDashboard({ token, user, onLogout, onGoPublic }: StudentDashboardProps) {
  const [tab, setTab] = useState<StudentTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [studentProfile, setStudentProfile] = useState<Record<string, unknown> | null>(null);
  const [enrollments, setEnrollments] = useState<Array<Record<string, unknown>>>([]);
  const [fees, setFees] = useState({ totalCourseFees: 0, feesPaid: 0, remainingFees: 0 });
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [classes, setClasses] = useState<LiveClassItem[]>([]);
  const [recordings, setRecordings] = useState<ClassRecordingItem[]>([]);
  const [materials, setMaterials] = useState<StudyMaterialItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [attendance, setAttendance] = useState<{ records: Array<Record<string, unknown>>; percentage: number }>({
    records: [],
    percentage: 100,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [doubts, setDoubts] = useState<DoubtItem[]>([]);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [brokers, setBrokers] = useState<BrokerItem[]>([]);

  // Active Exam Runner State
  const [activeExam, setActiveExam] = useState<{
    exam: ExamItem;
    questions: Array<{ id: number; question_text: string; marks: number; options: Array<{ id: number; option_text: string }> }>;
  } | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, number>>({});
  const [examCurrentIdx, setExamCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Payment Checkout State
  const [payForm, setPayForm] = useState({
    courseId: 0,
    amount: 250,
    paymentMethod: 'RAZORPAY',
    paymentMode: 'INSTALLMENT',
    discountCode: '',
  });
  const [pendingCheckout, setPendingCheckout] = useState<{
    orderId: string;
    amount: number;
    courseTitle: string;
    sandboxCheckoutPayload: { orderId: string; paymentId: string; signature: string };
  } | null>(null);

  // Doubt Form
  const [doubtForm, setDoubtForm] = useState({ courseId: 0, title: '', description: '' });
  const [followUp, setFollowUp] = useState<Record<number, string>>({});

  // Referral Invite Form
  const [refForm, setRefForm] = useState({ referredName: '', referredEmail: '' });

  // Password Change
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });

  const loadStudentData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sRes, pRes, clRes, matRes, exRes, attRes, nRes, dRes] = await Promise.all([
        apiRequest<{
          student: Record<string, unknown>;
          enrollments: Array<Record<string, unknown>>;
          fees: { totalCourseFees: number; feesPaid: number; remainingFees: number };
          receipts: ReceiptItem[];
          attendancePct: number;
          referrals: Array<Record<string, unknown>>;
          brokers: BrokerItem[];
        }>('/api/student/dashboard', { token }),
        apiRequest<{ payments: PaymentItem[] }>('/api/payments', { token }),
        apiRequest<{ classes: LiveClassItem[]; recordings: ClassRecordingItem[] }>('/api/classes', { token }),
        apiRequest<{ materials: StudyMaterialItem[] }>('/api/materials', { token }),
        apiRequest<{ exams: ExamItem[] }>('/api/exams', { token }),
        apiRequest<{ records: Array<Record<string, unknown>>; percentage: number }>('/api/attendance', { token }),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
        apiRequest<{ doubts: DoubtItem[] }>('/api/doubts', { token }),
      ]);

      setStudentProfile(sRes.student);
      setEnrollments(sRes.enrollments);
      setFees(sRes.fees);
      setReceipts(sRes.receipts);
      setReferrals(sRes.referrals);
      setBrokers(sRes.brokers);
      setPayments(pRes.payments);
      setClasses(clRes.classes);
      setRecordings(clRes.recordings);
      setMaterials(matRes.materials);
      setExams(exRes.exams);
      setAttendance(attRes);
      setNotifications(nRes.notifications);
      setDoubts(dRes.doubts);

      const firstCourseId = Number(sRes.enrollments[0]?.course_id ?? 0);
      if (firstCourseId) {
        setPayForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
        setDoubtForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Student Dashboard.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStudentData();
  }, [loadStudentData]);

  const submitExamAttempt = useCallback(
    async (autoSubmitted: boolean) => {
      if (!activeExam) return;
      try {
        const res = await apiRequest<{ score: number; totalMarks: number; percentage: number; passed: boolean; feedback: string }>(
          `/api/exams/${activeExam.exam.id}/submit`,
          {
            method: 'POST',
            token,
            body: { answers: examAnswers, autoSubmitted },
          }
        );
        setActiveExam(null);
        setNotice(`Exam submitted! Score: ${res.score}/${res.totalMarks} (${res.percentage}%) — ${res.passed ? 'PASSED' : 'REVIEW NEEDED'}`);
        await loadStudentData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit examination.');
      }
    },
    [activeExam, examAnswers, token, loadStudentData]
  );

  // Live Examination Countdown Timer with Auto-Submit
  useEffect(() => {
    if (!activeExam) return;
    if (secondsLeft <= 0) {
      void submitExamAttempt(true);
      return;
    }
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [activeExam, secondsLeft, submitExamAttempt]);

  const handleStartExam = async (examId: number) => {
    try {
      const res = await apiRequest<{
        exam: ExamItem;
        questions: Array<{ id: number; question_text: string; marks: number; options: Array<{ id: number; option_text: string }> }>;
      }>(`/api/exams/${examId}/start`, { method: 'POST', token });
      setActiveExam(res);
      setExamAnswers({});
      setExamCurrentIdx(0);
      setSecondsLeft(res.exam.duration_mins * 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot start examination.');
    }
  };

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const order = await apiRequest<typeof pendingCheckout>('/api/payments/create-order', {
        method: 'POST',
        token,
        body: payForm,
      });
      setPendingCheckout(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initiate payment order.');
    }
  };

  const handleVerifySandboxPayment = async () => {
    if (!pendingCheckout) return;
    try {
      const res = await apiRequest<{ verified: boolean; receipt: ReceiptItem }>('/api/payments/verify', {
        method: 'POST',
        token,
        body: pendingCheckout.sandboxCheckoutPayload,
      });
      setPendingCheckout(null);
      setNotice(`Payment verified by server! Receipt ${res.receipt.receipt_number} issued.`);
      await loadStudentData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server signature verification failed.');
    }
  };

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;
  const referralCode = String(studentProfile?.referral_code || '');
  const referralLink = `${window.location.origin}/?ref=${referralCode}`;

  const navItems: Array<{ id: StudentTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'courses', label: 'My Courses', icon: BookOpen },
    { id: 'classes', label: 'Live Classes', icon: Video },
    { id: 'materials', label: 'Study Materials', icon: Download },
    { id: 'exams', label: 'Online Tests', icon: ClipboardList },
    { id: 'attendance', label: 'Attendance', icon: CheckCircle2 },
    { id: 'payments', label: 'Payments & Receipts', icon: CreditCard },
    { id: 'notifications', label: `Notifications${unreadCount ? ` (${unreadCount})` : ''}`, icon: Bell },
    { id: 'doubts', label: 'Ask a Doubt', icon: HelpCircle },
    { id: 'referrals', label: 'Refer and Earn', icon: Gift },
    { id: 'brokers', label: 'Broker Info', icon: Building2 },
  ];

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#08101E] text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-[#0A1323] hidden lg:flex flex-col justify-between p-4">
        <div>
          <div className="px-3 py-3 border-b border-slate-800">
            <p className="font-display text-base font-bold text-white">Aurelia FX Academy</p>
            <p className="font-mono-tabular text-xs text-[#D4A843] mt-0.5">
              {String(studentProfile?.student_id_code || user.studentCode || 'Student Portal')}
            </p>
          </div>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer ${
                    tab === item.id ? 'bg-[#D4A843] text-[#08101E] font-semibold' : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <button type="button" onClick={onGoPublic} className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 cursor-pointer">
            Academy Home
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-slate-800 bg-[#0A1323] px-6 py-3.5 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Student Portal <span aria-hidden="true">/</span>{' '}
            <span className="text-white font-medium">{String(studentProfile?.full_name || user.fullName)}</span>
          </p>
          <div className="flex items-center gap-3">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as StudentTab)}
              className="lg:hidden rounded-lg border border-slate-700 bg-[#08101E] px-2.5 py-1.5 text-xs text-white"
            >
              {navItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={onLogout} className="lg:hidden text-xs text-[#E5BE5C] cursor-pointer">
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1280px] w-full mx-auto space-y-6">
          {error && <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-200">{error}</div>}
          {notice && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200 flex justify-between">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {loading && !studentProfile ? (
            <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-8 text-sm text-slate-400">Loading student dashboard...</div>
          ) : null}

          {/* TAB: DASHBOARD */}
          {tab === 'dashboard' && studentProfile && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Student ID</p>
                  <p className="mt-1 font-mono-tabular text-base font-bold text-[#E5BE5C]">
                    {String(studentProfile.student_id_code)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Enrolled Courses</p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-white">{enrollments.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Fees Paid</p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-emerald-400">${fees.feesPaid.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Remaining Fees</p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-amber-400">${fees.remainingFees.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Attendance</p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-white">{attendance.percentage}%</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Enrolled Programs & Progress</h2>
                  <div className="space-y-3 text-xs">
                    {enrollments.map((enr) => (
                      <div key={String(enr.id)} className="rounded-lg border border-slate-800 bg-[#08101E] p-4">
                        <div className="flex justify-between">
                          <span className="font-semibold text-white">{String(enr.course_title)}</span>
                          <span className="font-mono-tabular text-[#E5BE5C]">{String(enr.progress_pct)}%</span>
                        </div>
                        <p className="text-slate-400 mt-1">
                          Mentor: {String(enr.mentor_name || 'Faculty')} · {String(enr.duration)}
                        </p>
                        <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-[#D4A843]" style={{ width: `${Number(enr.progress_pct || 0)}%` }} />
                        </div>
                      </div>
                    ))}
                    {enrollments.length === 0 && (
                      <p className="text-slate-400">No active course enrollment yet. Submit an admission application on the Academy homepage.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Upcoming Live Classes & Notifications</h2>
                  <div className="divide-y divide-slate-800 text-xs">
                    {classes.slice(0, 4).map((c) => (
                      <div key={c.id} className="py-2.5 flex justify-between gap-2">
                        <div>
                          <p className="text-white font-medium">{c.title}</p>
                          <p className="font-mono-tabular text-slate-400">
                            {c.class_date} {c.start_time} · {c.meeting_platform}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTab('classes')}
                          className="text-[#E5BE5C] hover:underline shrink-0 cursor-pointer"
                        >
                          Open
                        </button>
                      </div>
                    ))}
                    {classes.length === 0 && <p className="py-3 text-slate-400">No upcoming live sessions for your courses.</p>}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: PROFILE & PASSWORD */}
          {tab === 'profile' && studentProfile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-6 space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Student Profile</h2>
                <p>
                  <span className="text-slate-400">Student ID:</span>{' '}
                  <span className="font-mono-tabular text-[#E5BE5C]">{String(studentProfile.student_id_code)}</span>
                </p>
                <p>
                  <span className="text-slate-400">Full Name:</span> <span className="text-white">{String(studentProfile.full_name)}</span>
                </p>
                <p>
                  <span className="text-slate-400">Email:</span> <span className="text-white">{String(studentProfile.email)}</span>
                </p>
                <p>
                  <span className="text-slate-400">Mobile:</span> <span className="text-white">{String(studentProfile.mobile)}</span>
                </p>
                <p>
                  <span className="text-slate-400">Referral Code:</span>{' '}
                  <span className="font-mono-tabular text-[#E5BE5C]">{referralCode}</span>
                </p>
                {!user.emailVerified && (
                  <button
                    type="button"
                    onClick={() =>
                      void apiRequest('/api/auth/verify-email', { method: 'POST', token }).then(() =>
                        setNotice('Email address verified.')
                      )
                    }
                    className="mt-2 rounded-lg border border-emerald-600 px-3 py-1.5 text-emerald-300 cursor-pointer"
                  >
                    Verify Email Address
                  </button>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void apiRequest('/api/auth/change-password', { method: 'POST', token, body: pwForm })
                    .then(() => {
                      setPwForm({ currentPassword: '', newPassword: '' });
                      setNotice('Password updated.');
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unable to change password.'));
                }}
                className="rounded-xl border border-slate-800 bg-[#0D172A] p-6 space-y-3 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-white">Change Login Password</h2>
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  placeholder="Current Password"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  placeholder="New Password (min 8 chars)"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="rounded-lg bg-[#D4A843] px-4 py-2 font-semibold text-[#08101E] cursor-pointer">
                  Update Password
                </button>
              </form>
            </div>
          )}

          {/* TAB: COURSES */}
          {tab === 'courses' && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-white">My Enrolled Courses</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {enrollments.map((e) => (
                  <div key={String(e.id)} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                    <p className="text-xs font-mono-tabular text-[#D4A843]">
                      {String(e.duration)} · {String(e.status)}
                    </p>
                    <h3 className="text-base font-semibold text-white mt-1">{String(e.course_title)}</h3>
                    <p className="text-xs text-slate-400 mt-1">Mentor: {String(e.mentor_name || 'Faculty')}</p>
                    <p className="text-xs font-mono-tabular text-slate-300 mt-3">Progress: {String(e.progress_pct)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LIVE CLASSES & RECORDINGS */}
          {tab === 'classes' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Scheduled Live Sessions</h2>
                {classes.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {c.class_date} · {c.start_time} · {c.meeting_platform}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-0.5">{c.title}</h3>
                      <p className="text-xs text-slate-400">{c.course_title}</p>
                    </div>
                    {c.meeting_link && (
                      <a
                        href={c.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-[#D4A843] px-3.5 py-2 text-xs font-semibold text-[#08101E] whitespace-nowrap shrink-0"
                      >
                        Join Session
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Recorded Class Replays</h2>
                {recordings.map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {r.course_title} · {r.duration_label}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-0.5">{r.title}</h3>
                    </div>
                    <a
                      href={r.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-[#E5BE5C]"
                    >
                      Watch Replay
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: STUDY MATERIALS */}
          {tab === 'materials' && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-white">Course Study Materials & PDF Notes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {materials.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-[#D4A843]">
                        {m.course_title} · {m.category}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-1">{m.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">{m.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void downloadProtectedFile(`/api/materials/${m.id}/download`, token, m.file_name)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-[#E5BE5C] hover:border-[#D4A843] shrink-0 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ONLINE EXAMS */}
          {tab === 'exams' && (
            <div className="space-y-6">
              {activeExam ? (
                <div className="rounded-xl border border-[#D4A843]/40 bg-[#0D172A] p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <p className="text-xs text-[#D4A843]">{activeExam.exam.course_title}</p>
                      <h2 className="font-display text-xl font-bold text-white">{activeExam.exam.title}</h2>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-[#08101E] px-4 py-2 font-mono-tabular text-base font-bold text-[#E5BE5C]">
                      Time Remaining: {formatTimer(secondsLeft)}
                    </div>
                  </div>

                  {/* Question Navigator */}
                  <div className="flex flex-wrap gap-2">
                    {activeExam.questions.map((q, idx) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setExamCurrentIdx(idx)}
                        className={`h-8 w-8 rounded-lg font-mono-tabular text-xs font-semibold cursor-pointer ${
                          examCurrentIdx === idx
                            ? 'bg-[#D4A843] text-[#08101E]'
                            : examAnswers[String(q.id)]
                              ? 'bg-emerald-700 text-white'
                              : 'border border-slate-700 text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>

                  {activeExam.questions[examCurrentIdx] && (
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-white">
                        Q{examCurrentIdx + 1}. {activeExam.questions[examCurrentIdx].question_text}
                      </p>
                      <div className="space-y-2">
                        {activeExam.questions[examCurrentIdx].options.map((opt) => {
                          const selected = examAnswers[String(activeExam.questions[examCurrentIdx].id)] === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setExamAnswers({
                                  ...examAnswers,
                                  [String(activeExam.questions[examCurrentIdx].id)]: opt.id,
                                })
                              }
                              className={`w-full text-left rounded-lg border px-4 py-3 text-xs transition-colors cursor-pointer ${
                                selected
                                  ? 'border-[#D4A843] bg-[#D4A843]/15 text-white font-medium'
                                  : 'border-slate-800 bg-[#08101E] text-slate-300 hover:border-slate-600'
                              }`}
                            >
                              {opt.option_text}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={examCurrentIdx === 0}
                      onClick={() => setExamCurrentIdx((i) => Math.max(0, i - 1))}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    {examCurrentIdx < activeExam.questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setExamCurrentIdx((i) => i + 1)}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-white cursor-pointer"
                      >
                        Next Question
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void submitExamAttempt(false)}
                        className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                      >
                        Submit Examination
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-white">Online Examinations & Results</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {exams.map((ex) => (
                      <div key={ex.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 space-y-3">
                        <p className="text-xs font-mono-tabular text-[#D4A843]">
                          {ex.course_title} · {ex.duration_mins} Mins · {ex.question_count} MCQs
                        </p>
                        <h3 className="text-base font-semibold text-white">{ex.title}</h3>
                        <p className="text-xs text-slate-400">{ex.description}</p>
                        {ex.submission_status === 'GRADED' ? (
                          <div className="rounded-lg border border-slate-800 bg-[#08101E] p-3 text-xs">
                            <p className="font-mono-tabular font-semibold text-white">
                              Result: {ex.score}/{ex.total_marks} ({ex.percentage}%) ·{' '}
                              <span className={ex.passed ? 'text-emerald-400' : 'text-red-400'}>
                                {ex.passed ? 'PASSED' : 'NEEDS REVIEW'}
                              </span>
                            </p>
                            <p className="text-slate-400 mt-1">{ex.feedback}</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleStartExam(ex.id)}
                            className="rounded-lg bg-[#D4A843] px-4 py-2 text-xs font-semibold text-[#08101E] cursor-pointer"
                          >
                            Start Timed Examination
                          </button>
                        )}
                      </div>
                    ))}
                    {exams.length === 0 && <p className="text-xs text-slate-400">No examinations assigned to your courses yet.</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: ATTENDANCE */}
          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">My Attendance Record</h2>
                  <p className="text-xs text-slate-400">Cumulative participation across enrolled courses</p>
                </div>
                <p className="font-mono-tabular text-2xl font-bold text-emerald-400">{attendance.percentage}%</p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {attendance.records.map((r) => (
                      <tr key={String(r.id)}>
                        <td className="px-4 py-3 font-mono-tabular text-slate-300">{String(r.attendance_date)}</td>
                        <td className="px-4 py-3 text-white">{String(r.course_title)}</td>
                        <td className="px-4 py-3 font-mono-tabular text-[#E5BE5C]">{String(r.status)}</td>
                        <td className="px-4 py-3 text-slate-400">{String(r.remarks || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: PAYMENTS & RECEIPTS */}
          {tab === 'payments' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-display text-lg font-bold text-white">Payment History & Official PDF Receipts</h2>
                <div className="space-y-3">
                  {receipts.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono-tabular text-[#E5BE5C]">
                          {r.receipt_number} · {r.payment_method} · {r.payment_status}
                        </p>
                        <h3 className="text-sm font-semibold text-white mt-0.5">{r.course_name}</h3>
                        <p className="text-xs font-mono-tabular text-slate-400">
                          Paid: ${r.payment_amount} · Remaining: ${r.remaining_balance}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadReceiptPdf(r)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-[#D4A843] shrink-0 cursor-pointer"
                      >
                        <Receipt className="h-3.5 w-3.5" /> Download PDF
                      </button>
                    </div>
                  ))}
                  {payments.length === 0 && <p className="text-xs text-slate-400">No payments recorded yet.</p>}
                </div>
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-4 text-xs">
                <h3 className="font-display text-base font-bold text-white">Pay Course Tuition / Installment</h3>
                {pendingCheckout ? (
                  <div className="space-y-3 rounded-lg border border-[#D4A843]/40 bg-[#08101E] p-4">
                    <p className="font-semibold text-[#E5BE5C]">Razorpay Secure Checkout Verification</p>
                    <p className="text-slate-300">
                      Order: <span className="font-mono-tabular">{pendingCheckout.orderId}</span>
                    </p>
                    <p className="text-slate-300">
                      Amount: <span className="font-mono-tabular font-bold text-white">${pendingCheckout.amount} USD</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleVerifySandboxPayment()}
                      className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                    >
                      Complete & Verify Payment Signature
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateOrder} className="space-y-3">
                    <select
                      value={payForm.courseId}
                      onChange={(e) => setPayForm({ ...payForm, courseId: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    >
                      {enrollments.map((e) => (
                        <option key={String(e.course_id)} value={Number(e.course_id)}>
                          {String(e.course_title)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={payForm.paymentMode}
                      onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    >
                      <option value="INSTALLMENT">Installment / Partial Payment</option>
                      <option value="FULL">Full Remaining Balance</option>
                    </select>
                    {payForm.paymentMode !== 'FULL' && (
                      <input
                        type="number"
                        min={50}
                        value={payForm.amount}
                        onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                        placeholder="Amount ($)"
                        className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                      />
                    )}
                    <input
                      value={payForm.discountCode}
                      onChange={(e) => setPayForm({ ...payForm, discountCode: e.target.value.toUpperCase() })}
                      placeholder="Discount Code (e.g. AURELIA10)"
                      className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                    <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                      Proceed to Verified Checkout
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB: NOTIFICATIONS */}
          {tab === 'notifications' && (
            <div className="space-y-3">
              <h2 className="font-display text-xl font-bold text-white">Notifications & Announcements</h2>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
                    n.is_read ? 'border-slate-800 bg-[#0D172A]' : 'border-[#D4A843]/40 bg-[#101D33]'
                  }`}
                >
                  <div>
                    <p className="text-xs font-mono-tabular text-[#D4A843]">
                      {n.category} · {n.is_read ? 'Read' : 'Unread'}
                    </p>
                    <h3 className="text-sm font-semibold text-white mt-1">{n.title}</h3>
                    <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                  </div>
                  {!n.is_read && (
                    <button
                      type="button"
                      onClick={() =>
                        void apiRequest(`/api/notifications/${n.id}/read`, { method: 'POST', token }).then(() => loadStudentData())
                      }
                      className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 shrink-0 cursor-pointer"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB: DOUBTS */}
          {tab === 'doubts' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-display text-lg font-bold text-white">My Mentor Doubt Threads</h2>
                {doubts.map((d) => (
                  <div key={d.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 space-y-3">
                    <p className="text-xs font-mono-tabular text-[#D4A843]">
                      {d.course_title} · Status: {d.status}
                    </p>
                    <h3 className="text-sm font-semibold text-white">{d.title}</h3>
                    <p className="text-xs text-slate-300">{d.description}</p>
                    <div className="space-y-2 pl-3 border-l border-slate-700 text-xs">
                      {d.replies.map((r) => (
                        <div key={r.id}>
                          <p className="font-semibold text-slate-200">
                            {r.author_name} ({r.author_role})
                          </p>
                          <p className="text-slate-300">{r.message}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 text-xs">
                      <input
                        value={followUp[d.id] || ''}
                        onChange={(e) => setFollowUp({ ...followUp, [d.id]: e.target.value })}
                        placeholder="Ask a follow-up question..."
                        className="flex-1 rounded-lg border border-slate-700 bg-[#08101E] px-3 py-1.5 text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void apiRequest(`/api/doubts/${d.id}/reply`, {
                            method: 'POST',
                            token,
                            body: { message: followUp[d.id] || '' },
                          }).then(() => {
                            setFollowUp({ ...followUp, [d.id]: '' });
                            return loadStudentData();
                          })
                        }
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 cursor-pointer"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void apiRequest('/api/doubts', { method: 'POST', token, body: doubtForm })
                    .then(() => {
                      setDoubtForm({ ...doubtForm, title: '', description: '' });
                      setNotice('Doubt submitted to your course mentor.');
                      return loadStudentData();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unable to submit doubt.'));
                }}
                className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs"
              >
                <h3 className="font-display text-base font-bold text-white">Ask a Course Doubt</h3>
                <select
                  value={doubtForm.courseId}
                  onChange={(e) => setDoubtForm({ ...doubtForm, courseId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {enrollments.map((e) => (
                    <option key={String(e.course_id)} value={Number(e.course_id)}>
                      {String(e.course_title)}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={doubtForm.title}
                  onChange={(e) => setDoubtForm({ ...doubtForm, title: e.target.value })}
                  placeholder="Question Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <textarea
                  required
                  rows={4}
                  value={doubtForm.description}
                  onChange={(e) => setDoubtForm({ ...doubtForm, description: e.target.value })}
                  placeholder="Describe your chart setup or concept question..."
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Submit Question
                </button>
              </form>
            </div>
          )}

          {/* TAB: REFER & EARN */}
          {tab === 'referrals' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 space-y-3">
                  <h2 className="font-display text-lg font-bold text-white">Your Referral Code & Share Link</h2>
                  <p className="text-xs text-slate-400">
                    Share your code with prospective students. Qualifying rewards require admission approval and tuition
                    verification.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-lg border border-[#D4A843]/40 bg-[#08101E] px-3.5 py-2 font-mono-tabular text-sm font-bold text-[#E5BE5C]">
                      {referralCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(referralLink);
                        setNotice('Referral link copied to clipboard.');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Share Link
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">Referral History</h3>
                  <div className="divide-y divide-slate-800 text-xs">
                    {referrals.map((r) => (
                      <div key={String(r.id)} className="py-2.5 flex justify-between">
                        <span>
                          {String(r.referred_name)} ({String(r.referred_email)})
                        </span>
                        <span className="font-mono-tabular text-[#E5BE5C]">
                          {String(r.status)} {r.reward_status ? `· $${r.reward_amount} (${r.reward_status})` : ''}
                        </span>
                      </div>
                    ))}
                    {referrals.length === 0 && <p className="py-3 text-slate-400">No referrals submitted yet.</p>}
                  </div>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void apiRequest('/api/student/referrals', { method: 'POST', token, body: refForm }).then(() => {
                    setRefForm({ referredName: '', referredEmail: '' });
                    setNotice('Referral recorded.');
                    return loadStudentData();
                  });
                }}
                className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs"
              >
                <h3 className="font-display text-base font-bold text-white">Refer a Candidate</h3>
                <input
                  required
                  value={refForm.referredName}
                  onChange={(e) => setRefForm({ ...refForm, referredName: e.target.value })}
                  placeholder="Candidate Name"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  type="email"
                  value={refForm.referredEmail}
                  onChange={(e) => setRefForm({ ...refForm, referredEmail: e.target.value })}
                  placeholder="Candidate Email"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Register Referral
                </button>
              </form>
            </div>
          )}

          {/* TAB: BROKERS */}
          {tab === 'brokers' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex items-start gap-3 text-xs text-amber-100">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Affiliate Disclosure & Risk Notice: Aurelia FX Academy may earn partner commissions on links below.
                  Margin FX trading involves substantial risk of loss; no broker is guaranteed safe or profitable.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {brokers.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 space-y-2">
                    <p className="text-xs font-mono-tabular text-[#D4A843]">{b.regulation_info}</p>
                    <h3 className="text-base font-semibold text-white">{b.name}</h3>
                    <p className="text-xs text-slate-300">{b.description}</p>
                    <div className="pt-2 flex gap-3 text-xs">
                      <a href={b.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-200 underline">
                        Official Site <ExternalLink className="h-3 w-3" />
                      </a>
                      <a href={b.partner_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#E5BE5C] underline">
                        Partner Link <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
