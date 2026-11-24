import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { downloadAttendanceReportPdf, downloadReceiptPdf } from '../lib/pdf';
import { BarMetricChart, DoughnutMetricChart, LineMetricChart } from './Charts';
import type {
  AdmissionItem,
  AuthUser,
  BrokerItem,
  CourseItem,
  LiveClassItem,
  MentorItem,
  NotificationItem,
  PaymentItem,
  ReceiptItem,
  StudyMaterialItem,
} from '../types/academy';

interface AdminDashboardProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
  onGoPublic: () => void;
}

type AdminTab =
  | 'overview'
  | 'courses'
  | 'admissions'
  | 'students'
  | 'payments'
  | 'mentors'
  | 'classes'
  | 'materials'
  | 'attendance'
  | 'referrals'
  | 'brokers'
  | 'notifications'
  | 'reports'
  | 'security';

export function AdminDashboard({ token, user, onLogout, onGoPublic }: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Analytics Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('2026');

  const [dashboard, setDashboard] = useState<{
    kpis: Record<string, number>;
    charts: {
      dailyAdmissionsSeries: Array<{ label: string; count: number }>;
      monthlyAdmissionsSeries: Array<{ label: string; count: number }>;
      monthlyRevenueSeries: Array<{ label: string; total: number }>;
      courseEnrollmentSeries: Array<{ label: string; count: number }>;
      paymentStatusSeries: Array<{ label: string; count: number }>;
      attendanceSeries: Array<{ label: string; count: number }>;
    };
    recentActivities: {
      recentStudents: Array<Record<string, unknown>>;
      recentAdmissions: Array<Record<string, unknown>>;
      recentPayments: Array<Record<string, unknown>>;
      upcomingMeetings: Array<Record<string, unknown>>;
      latestSubmissions: Array<Record<string, unknown>>;
      recentNotifications: Array<Record<string, unknown>>;
    };
  } | null>(null);

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [admissions, setAdmissions] = useState<AdmissionItem[]>([]);
  const [students, setStudents] = useState<Array<Record<string, unknown>>>([]);
  const [mentors, setMentors] = useState<MentorItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [classes, setClasses] = useState<LiveClassItem[]>([]);
  const [materials, setMaterials] = useState<StudyMaterialItem[]>([]);
  const [attendance, setAttendance] = useState<Array<Record<string, unknown>>>([]);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [referralSettings, setReferralSettings] = useState<{ reward_amount: number; terms: string }>({
    reward_amount: 100,
    terms: '',
  });
  const [brokers, setBrokers] = useState<BrokerItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [discounts, setDiscounts] = useState<Array<Record<string, unknown>>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loginHistory, setLoginHistory] = useState<Array<Record<string, unknown>>>([]);

  // Issued one-time credentials modal
  const [issuedCredentialModal, setIssuedCredentialModal] = useState<{
    title: string;
    code: string;
    username: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);

  // Admission Search / Filter
  const [admSearch, setAdmSearch] = useState('');
  const [admStatusFilter, setAdmStatusFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Course creation state
  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    duration: '8 Weeks',
    fees: 950,
    discountedFees: 790,
    mentorId: '',
    syllabusText: 'Module 1: Core Concepts\nModule 2: Risk Execution\nModule 3: Live Practicum',
    outcomesText: 'Build verifiable trade plans\nCalculate dynamic risk sizing',
  });

  // Mentor creation state
  const [newMentor, setNewMentor] = useState({
    fullName: '',
    email: '',
    phone: '',
    specialization: '',
    experienceYears: 6,
    qualification: '',
    bio: '',
  });

  // Broker creation state
  const [newBroker, setNewBroker] = useState({
    name: '',
    logoText: '',
    description: '',
    educationalNotes: '',
    officialUrl: 'https://example.com',
    partnerUrl: 'https://example.com?ref=aurelia',
    regulationInfo: 'FCA / ASIC',
    minDeposit: '$200',
    leverageInfo: '1:30',
  });

  // Notification creation state
  const [newNotif, setNewNotif] = useState({
    title: '',
    message: '',
    category: 'New Course Available',
    targetRole: 'ALL',
  });

  // Discount creation state
  const [newDiscount, setNewDiscount] = useState({
    code: '',
    title: '',
    discountType: 'PERCENT',
    value: 15,
  });

  // Material upload state
  const [matTitle, setMatTitle] = useState('');
  const [matCourseId, setMatCourseId] = useState<number>(1);
  const [matCategory, setMatCategory] = useState('PDF_NOTES');
  const [matDesc, setMatDesc] = useState('');
  const [matFile, setMatFile] = useState<File | null>(null);

  // Live class creation
  const [newClass, setNewClass] = useState({
    courseId: 1,
    title: '',
    description: '',
    classDate: new Date().toISOString().slice(0, 10),
    startTime: '14:00',
    durationMins: 60,
    meetingPlatform: 'ZOOM',
    meetingLink: 'https://zoom.us/j/9988776655',
  });

  const loadOverview = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterDate) qs.set('date', filterDate);
    if (filterMonth) qs.set('month', filterMonth);
    if (filterYear) qs.set('year', filterYear);
    const data = await apiRequest<typeof dashboard>(`/api/admin/dashboard?${qs.toString()}`, { token });
    setDashboard(data);
  }, [token, filterDate, filterMonth, filterYear]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await loadOverview();
      const [cRes, aRes, sRes, mRes, pRes, clRes, matRes, attRes, refRes, bRes, nRes, doRes, auRes] = await Promise.all([
        apiRequest<{ courses: CourseItem[] }>('/api/admin/courses', { token }),
        apiRequest<{ admissions: AdmissionItem[] }>('/api/admin/admissions', { token }),
        apiRequest<{ students: Array<Record<string, unknown>> }>('/api/admin/students', { token }),
        apiRequest<{ mentors: MentorItem[] }>('/api/admin/mentors', { token }),
        apiRequest<{ payments: PaymentItem[] }>('/api/payments', { token }),
        apiRequest<{ classes: LiveClassItem[] }>('/api/classes', { token }),
        apiRequest<{ materials: StudyMaterialItem[] }>('/api/materials', { token }),
        apiRequest<{ records: Array<Record<string, unknown>> }>('/api/attendance', { token }),
        apiRequest<{ referrals: Array<Record<string, unknown>>; settings: { reward_amount: number; terms: string } }>('/api/admin/referrals', { token }),
        apiRequest<{ brokers: BrokerItem[] }>('/api/admin/brokers', { token }),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
        apiRequest<{ discounts: Array<Record<string, unknown>> }>('/api/admin/discounts-offers', { token }),
        apiRequest<{ logs: Array<Record<string, unknown>>; loginHistory: Array<Record<string, unknown>> }>('/api/admin/audit-logs', { token }),
      ]);
      setCourses(cRes.courses);
      if (cRes.courses[0]) {
        setMatCourseId(cRes.courses[0].id);
        setNewClass((prev) => ({ ...prev, courseId: cRes.courses[0].id }));
      }
      setAdmissions(aRes.admissions);
      setStudents(sRes.students);
      setMentors(mRes.mentors);
      setPayments(pRes.payments);
      setClasses(clRes.classes);
      setMaterials(matRes.materials);
      setAttendance(attRes.records);
      setReferrals(refRes.referrals);
      if (refRes.settings) setReferralSettings(refRes.settings);
      setBrokers(bRes.brokers);
      setNotifications(nRes.notifications);
      setDiscounts(doRes.discounts);
      setAuditLogs(auRes.logs);
      setLoginHistory(auRes.loginHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Admin Console.');
    } finally {
      setLoading(false);
    }
  }, [token, loadOverview]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleApproveAdmission = async (id: number) => {
    setError('');
    try {
      const res = await apiRequest<{
        approved: boolean;
        studentIdCode: string;
        generatedCredentials: { studentIdCode: string; username: string; temporaryPassword: string } | null;
      }>(`/api/admin/admissions/${id}/approve`, { method: 'POST', token });
      if (res.generatedCredentials) {
        setIssuedCredentialModal({
          title: 'Admission Approved — Student Credentials Generated',
          code: res.generatedCredentials.studentIdCode,
          username: res.generatedCredentials.username,
          email: '',
          temporaryPassword: res.generatedCredentials.temporaryPassword,
        });
      } else {
        setNotice(`Admission approved for Student ID ${res.studentIdCode}`);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    }
  };

  const handleRejectAdmission = async (id: number) => {
    try {
      await apiRequest(`/api/admin/admissions/${id}/reject`, {
        method: 'POST',
        token,
        body: { remarks: 'Declined after admissions review' },
      });
      setNotice('Admission marked as rejected.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject admission.');
    }
  };

  const handleIssueStudentCreds = async (studentId: number) => {
    try {
      const res = await apiRequest<{ studentIdCode: string; username: string; email: string; temporaryPassword: string }>(
        `/api/admin/students/${studentId}/issue-credentials`,
        { method: 'POST', token }
      );
      setIssuedCredentialModal({
        title: 'One-Time Student Login Credentials',
        code: res.studentIdCode,
        username: res.username,
        email: res.email,
        temporaryPassword: res.temporaryPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue credentials.');
    }
  };

  const handleIssueMentorCreds = async (mentorId: number) => {
    try {
      const res = await apiRequest<{ mentorCode: string; username: string; email: string; temporaryPassword: string }>(
        `/api/admin/mentors/${mentorId}/issue-credentials`,
        { method: 'POST', token }
      );
      setIssuedCredentialModal({
        title: 'One-Time Mentor Login Credentials',
        code: res.mentorCode,
        username: res.username,
        email: res.email,
        temporaryPassword: res.temporaryPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue credentials.');
    }
  };

  const handleCreateCourse = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/courses', {
        method: 'POST',
        token,
        body: {
          title: newCourse.title,
          description: newCourse.description,
          duration: newCourse.duration,
          fees: Number(newCourse.fees),
          discountedFees: Number(newCourse.discountedFees),
          mentorId: newCourse.mentorId ? Number(newCourse.mentorId) : null,
          syllabus: newCourse.syllabusText.split('\n').filter(Boolean),
          outcomes: newCourse.outcomesText.split('\n').filter(Boolean),
        },
      });
      setNotice('New course created.');
      setNewCourse({ ...newCourse, title: '', description: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create course.');
    }
  };

  const handleToggleCourse = async (c: CourseItem) => {
    const next = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await apiRequest(`/api/admin/courses/${c.id}/status`, { method: 'PATCH', token, body: { status: next } });
    await loadAll();
  };

  const handleCreateMentor = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ mentorCode: string; username: string; email: string; temporaryPassword: string }>('/api/admin/mentors', {
        method: 'POST',
        token,
        body: newMentor,
      });
      setIssuedCredentialModal({
        title: 'Mentor Account Created',
        code: res.mentorCode,
        username: res.username,
        email: res.email,
        temporaryPassword: res.temporaryPassword,
      });
      setNewMentor({ fullName: '', email: '', phone: '', specialization: '', experienceYears: 6, qualification: '', bio: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create mentor.');
    }
  };

  const handleCreateBroker = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/brokers', { method: 'POST', token, body: newBroker });
      setNotice('Broker added to directory.');
      setNewBroker({ ...newBroker, name: '', description: '', educationalNotes: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create broker.');
    }
  };

  const handlePublishNotification = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/notifications', { method: 'POST', token, body: newNotif });
      setNotice('Announcement published.');
      setNewNotif({ ...newNotif, title: '', message: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish notification.');
    }
  };

  const handleUploadMaterial = async (e: FormEvent) => {
    e.preventDefault();
    if (!matFile) {
      setError('Select a PDF, DOCX, PNG, JPG, or TXT file.');
      return;
    }
    const fd = new FormData();
    fd.append('courseId', String(matCourseId));
    fd.append('title', matTitle);
    fd.append('category', matCategory);
    fd.append('description', matDesc);
    fd.append('file', matFile);
    try {
      await apiRequest('/api/materials', { method: 'POST', token, body: fd, isFormData: true });
      setNotice('Study material uploaded securely.');
      setMatTitle('');
      setMatDesc('');
      setMatFile(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleCreateClass = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/classes', { method: 'POST', token, body: newClass });
      setNotice('Live class scheduled.');
      setNewClass({ ...newClass, title: '', description: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule class.');
    }
  };

  const handleDownloadReceipt = async (receiptId: number) => {
    try {
      const res = await apiRequest<{ receipt: ReceiptItem }>(`/api/receipts/${receiptId}`, { token });
      downloadReceiptPdf(res.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download receipt.');
    }
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { id: 'overview', label: 'Analytics Overview', icon: BarChart3 },
    { id: 'admissions', label: 'Admissions', icon: UserCheck },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'payments', label: 'Fees & Payments', icon: CreditCard },
    { id: 'mentors', label: 'Mentors', icon: GraduationCap },
    { id: 'classes', label: 'Live Classes', icon: Video },
    { id: 'materials', label: 'Study Materials', icon: Download },
    { id: 'attendance', label: 'Attendance', icon: CheckCircle2 },
    { id: 'referrals', label: 'Refer & Earn', icon: Plus },
    { id: 'brokers', label: 'Brokers', icon: Building2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reports', label: 'Excel & PDF Exports', icon: FileSpreadsheet },
    { id: 'security', label: 'Audit & Login Logs', icon: ShieldCheck },
  ];

  const filteredAdmissions = admissions.filter((a) => {
    const matchQ =
      !admSearch ||
      a.full_name.toLowerCase().includes(admSearch.toLowerCase()) ||
      a.email.toLowerCase().includes(admSearch.toLowerCase()) ||
      a.admission_no.toLowerCase().includes(admSearch.toLowerCase());
    const matchStatus = !admStatusFilter || a.status === admStatusFilter;
    return matchQ && matchStatus;
  });

  const filteredStudents = students.filter((s) => {
    if (!studentSearch) return true;
    const needle = studentSearch.toLowerCase();
    return (
      String(s.full_name).toLowerCase().includes(needle) ||
      String(s.student_id_code).toLowerCase().includes(needle) ||
      String(s.email).toLowerCase().includes(needle)
    );
  });

  return (
    <div className="min-h-screen bg-[#08101E] text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-800 bg-[#0A1323] hidden lg:flex flex-col justify-between p-4">
        <div>
          <div className="px-3 py-3 border-b border-slate-800">
            <p className="font-display text-base font-bold text-white">Aurelia FX Academy</p>
            <p className="text-xs text-[#D4A843] mt-0.5">Administrator Console</p>
          </div>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    tab === item.id ? 'bg-[#D4A843] text-[#08101E] font-semibold' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
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
          <button
            type="button"
            onClick={onGoPublic}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            View Public Site
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-red-950/70 hover:text-red-200 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-slate-800 bg-[#0A1323] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as AdminTab)}
              className="lg:hidden rounded-lg border border-slate-700 bg-[#08101E] px-3 py-1.5 text-xs text-white"
            >
              {navItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              Admin Console <span aria-hidden="true">/</span>{' '}
              <span className="text-white font-medium">{navItems.find((n) => n.id === tab)?.label}</span>
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-300">{user.fullName}</span>
            <button type="button" onClick={onLogout} className="lg:hidden text-[#E5BE5C] cursor-pointer">
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1320px] w-full mx-auto space-y-6">
          {error && <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-200">{error}</div>}
          {notice && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200 flex justify-between">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {loading && !dashboard ? (
            <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-8 text-sm text-slate-400">Loading academy telemetry...</div>
          ) : null}

          {/* TAB: OVERVIEW */}
          {tab === 'overview' && dashboard && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">Institutional Overview</h1>
                  <p className="text-xs text-slate-400 mt-1">Filter academy admissions and tuition revenue by date, month, or year.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-[#0D172A] px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-[#0D172A] px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="number"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    placeholder="Year"
                    className="w-20 rounded-lg border border-slate-700 bg-[#0D172A] px-2.5 py-1.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void loadOverview()}
                    className="rounded-lg bg-[#D4A843] px-3 py-1.5 font-semibold text-[#08101E] cursor-pointer"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* 10 KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  ['Total Students', dashboard.kpis.totalStudents],
                  ['Active Students', dashboard.kpis.activeStudents],
                  ['New Admissions Today', dashboard.kpis.newAdmissionsToday],
                  ['Monthly Admissions', dashboard.kpis.monthlyAdmissions],
                  ['Yearly Admissions', dashboard.kpis.yearlyAdmissions],
                  ['Total Courses', dashboard.kpis.totalCourses],
                  ['Total Revenue', `$${Number(dashboard.kpis.totalRevenue).toLocaleString()}`],
                  ['Pending Fees', `$${Number(dashboard.kpis.pendingFees).toLocaleString()}`],
                  ['Total Mentors', dashboard.kpis.totalMentors],
                  ['Upcoming Classes', dashboard.kpis.upcomingClasses],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="mt-1.5 font-mono-tabular text-xl font-bold text-white">{val}</p>
                  </div>
                ))}
              </div>

              {/* Analytics Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Daily Admissions</h2>
                  <BarMetricChart
                    labels={dashboard.charts.dailyAdmissionsSeries.map((d) => d.label)}
                    values={dashboard.charts.dailyAdmissionsSeries.map((d) => d.count)}
                    label="Admissions"
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Monthly Revenue (USD)</h2>
                  <LineMetricChart
                    labels={dashboard.charts.monthlyRevenueSeries.map((d) => d.label)}
                    values={dashboard.charts.monthlyRevenueSeries.map((d) => d.total)}
                    label="Revenue ($)"
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Course-Wise Enrollment</h2>
                  <BarMetricChart
                    labels={dashboard.charts.courseEnrollmentSeries.map((d) => d.label.slice(0, 14))}
                    values={dashboard.charts.courseEnrollmentSeries.map((d) => d.count)}
                    label="Enrolled"
                    color="#38BDF8"
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Monthly Admissions Trend</h2>
                  <LineMetricChart
                    labels={dashboard.charts.monthlyAdmissionsSeries.map((d) => d.label)}
                    values={dashboard.charts.monthlyAdmissionsSeries.map((d) => d.count)}
                    label="Admissions"
                    color="#D4A843"
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Payment Status Breakdown</h2>
                  <DoughnutMetricChart
                    labels={dashboard.charts.paymentStatusSeries.map((d) => d.label)}
                    values={dashboard.charts.paymentStatusSeries.map((d) => d.count)}
                  />
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Attendance Distribution</h2>
                  <DoughnutMetricChart
                    labels={dashboard.charts.attendanceSeries.map((d) => d.label)}
                    values={dashboard.charts.attendanceSeries.map((d) => d.count)}
                    colors={['#16A34A', '#D97706', '#DC2626']}
                  />
                </div>
              </div>

              {/* Recent Activities */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Recent Admissions & Meetings</h2>
                  <div className="divide-y divide-slate-800/80 text-xs">
                    {dashboard.recentActivities.recentAdmissions.map((a) => (
                      <div key={String(a.id)} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">
                            {String(a.full_name)} · <span className="font-mono-tabular text-slate-400">{String(a.admission_no)}</span>
                          </p>
                          <p className="text-slate-400">{String(a.course_title)}</p>
                        </div>
                        <span className="font-mono-tabular text-[#E5BE5C]">{String(a.status)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Recent Verified Payments & Notifications</h2>
                  <div className="divide-y divide-slate-800/80 text-xs">
                    {dashboard.recentActivities.recentPayments.map((p) => (
                      <div key={String(p.id)} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">
                            {String(p.student_name)} · <span className="font-mono-tabular text-slate-400">{String(p.student_id_code)}</span>
                          </p>
                          <p className="text-slate-400">{String(p.payment_method)}</p>
                        </div>
                        <span className="font-mono-tabular text-emerald-400">
                          ${Number(p.amount).toFixed(2)} ({String(p.status)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: ADMISSIONS */}
          {tab === 'admissions' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-xl font-bold text-white">Student Admissions Management</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={admSearch}
                    onChange={(e) => setAdmSearch(e.target.value)}
                    placeholder="Search applicant or ID..."
                    className="rounded-lg border border-slate-700 bg-[#0D172A] px-3 py-1.5 text-xs text-white"
                  />
                  <select
                    value={admStatusFilter}
                    onChange={(e) => setAdmStatusFilter(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-[#0D172A] px-3 py-1.5 text-xs text-white"
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void downloadProtectedFile('/api/admin/export/admissions', token, 'admissions.xlsx')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-[#D4A843] cursor-pointer"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Admission No</th>
                      <th className="px-4 py-3">Applicant</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Date & Meeting</th>
                      <th className="px-4 py-3 text-right">Final Fees</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredAdmissions.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono-tabular text-slate-300">{a.admission_no}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{a.full_name}</p>
                          <p className="text-slate-400">{a.email}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{a.course_title}</td>
                        <td className="px-4 py-3 font-mono-tabular text-slate-400">
                          {a.admission_date}
                          {a.meeting_date ? ` · Mtg: ${a.meeting_date} ${a.meeting_time || ''}` : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-white">${a.final_fees}</td>
                        <td className="px-4 py-3 font-mono-tabular">
                          <span
                            className={
                              a.status === 'APPROVED'
                                ? 'text-emerald-400'
                                : a.status === 'REJECTED'
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                            }
                          >
                            {a.status}
                          </span>
                          {a.student_id_code && <p className="text-[11px] text-slate-400">{a.student_id_code}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a.status === 'PENDING' ? (
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleApproveAdmission(a.id)}
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                              >
                                Approve & Issue ID
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRejectAdmission(a.id)}
                                className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-red-300 cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-500">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: STUDENTS */}
          {tab === 'students' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-xl font-bold text-white">Enrolled Students Directory</h1>
                <div className="flex items-center gap-2">
                  <input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search ID, name, or email..."
                    className="rounded-lg border border-slate-700 bg-[#0D172A] px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void downloadProtectedFile('/api/admin/export/students', token, 'students.xlsx')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 cursor-pointer"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Student ID</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Enrolled Courses</th>
                      <th className="px-4 py-3 text-right">Fees Paid</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Account Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredStudents.map((s) => (
                      <tr key={String(s.id)} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono-tabular text-[#E5BE5C]">{String(s.student_id_code)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{String(s.full_name)}</p>
                          <p className="text-slate-400">{String(s.email)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{String(s.enrolled_courses || 'Pending Enrollment')}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-white">${Number(s.total_paid || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono-tabular">
                          <span className={s.status === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'}>{String(s.status)}</span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => void handleIssueStudentCreds(Number(s.id))}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#D4A843] cursor-pointer"
                          >
                            <KeyRound className="h-3 w-3" /> Issue Password
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void apiRequest(`/api/admin/students/${s.id}/status`, {
                                method: 'PATCH',
                                token,
                                body: { active: s.status !== 'ACTIVE' },
                              }).then(() => loadAll())
                            }
                            className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white cursor-pointer"
                          >
                            {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: COURSES */}
          {tab === 'courses' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Course Catalog ({courses.length})</h1>
                {courses.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {c.duration} · Mentor: {c.mentor_name || 'Unassigned'} · Status:{' '}
                        <span className={c.status === 'ACTIVE' ? 'text-emerald-400' : 'text-amber-400'}>{c.status}</span>
                      </p>
                      <h3 className="mt-1 font-display text-base font-semibold text-white">{c.title}</h3>
                      <p className="mt-1 text-xs text-slate-300">{c.description}</p>
                      <p className="mt-2 font-mono-tabular text-xs text-[#E5BE5C]">
                        Fee: ${c.fees} · Discounted: ${c.discounted_fees}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleCourse(c)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-[#D4A843] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit">
                <h2 className="font-display text-lg font-bold text-white">Create New Course</h2>
                <form onSubmit={handleCreateCourse} className="mt-4 space-y-3 text-xs">
                  <input
                    required
                    value={newCourse.title}
                    onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                    placeholder="Course Title"
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <textarea
                    required
                    rows={3}
                    value={newCourse.description}
                    onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                    placeholder="Course Description"
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      required
                      value={newCourse.duration}
                      onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })}
                      placeholder="Duration"
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                    <input
                      required
                      type="number"
                      value={newCourse.fees}
                      onChange={(e) => setNewCourse({ ...newCourse, fees: Number(e.target.value) })}
                      placeholder="Fees"
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                    <input
                      required
                      type="number"
                      value={newCourse.discountedFees}
                      onChange={(e) => setNewCourse({ ...newCourse, discountedFees: Number(e.target.value) })}
                      placeholder="Discounted"
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                  </div>
                  <select
                    value={newCourse.mentorId}
                    onChange={(e) => setNewCourse({ ...newCourse, mentorId: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  >
                    <option value="">Assign Mentor (Optional)</option>
                    {mentors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.mentor_code})
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    value={newCourse.syllabusText}
                    onChange={(e) => setNewCourse({ ...newCourse, syllabusText: e.target.value })}
                    placeholder="Syllabus Modules (one per line)"
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
                  >
                    Publish Course
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: PAYMENTS */}
          {tab === 'payments' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-xl font-bold text-white">Fees, Verified Payments & Discount Codes</h1>
                <button
                  type="button"
                  onClick={() => void downloadProtectedFile('/api/admin/export/payments', token, 'payments.xlsx')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Export Payments Excel
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Order ID</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Receipt / Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-mono-tabular text-slate-300">{p.gateway_order_id}</td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{p.student_name}</p>
                          <p className="font-mono-tabular text-slate-400">{p.student_id_code}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{p.course_title}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-white">${p.amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-300">{p.payment_method}</td>
                        <td className="px-4 py-3 font-mono-tabular">
                          <span className={p.status === 'VERIFIED' ? 'text-emerald-400' : p.status === 'REFUNDED' ? 'text-amber-400' : 'text-slate-400'}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {p.receipt_id && (
                            <button
                              type="button"
                              onClick={() => void handleDownloadReceipt(p.receipt_id!)}
                              className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-[#E5BE5C] hover:border-[#D4A843] cursor-pointer"
                            >
                              PDF Receipt
                            </button>
                          )}
                          {p.status === 'VERIFIED' && (
                            <button
                              type="button"
                              onClick={() =>
                                void apiRequest(`/api/payments/${p.id}/refund`, { method: 'POST', token }).then(() => loadAll())
                              }
                              className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-red-300 cursor-pointer"
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Active Discount Codes</h2>
                  <div className="divide-y divide-slate-800 text-xs">
                    {discounts.map((d) => (
                      <div key={String(d.id)} className="py-2 flex justify-between">
                        <span className="font-mono-tabular text-[#E5BE5C]">{String(d.code)}</span>
                        <span className="text-slate-300">
                          {String(d.title)} ({String(d.discount_type)} {String(d.value)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void apiRequest('/api/admin/discounts', { method: 'POST', token, body: newDiscount }).then(() => {
                      setNewDiscount({ code: '', title: '', discountType: 'PERCENT', value: 15 });
                      return loadAll();
                    });
                  }}
                  className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 space-y-3 text-xs"
                >
                  <h2 className="text-sm font-semibold text-white">Create Discount Code</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      value={newDiscount.code}
                      onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })}
                      placeholder="CODE20"
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                    <input
                      required
                      value={newDiscount.title}
                      onChange={(e) => setNewDiscount({ ...newDiscount, title: e.target.value })}
                      placeholder="Title"
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newDiscount.discountType}
                      onChange={(e) => setNewDiscount({ ...newDiscount, discountType: e.target.value })}
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    >
                      <option value="PERCENT">Percentage (%)</option>
                      <option value="FLAT">Flat ($)</option>
                    </select>
                    <input
                      type="number"
                      required
                      value={newDiscount.value}
                      onChange={(e) => setNewDiscount({ ...newDiscount, value: Number(e.target.value) })}
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                  </div>
                  <button type="submit" className="rounded-lg bg-[#D4A843] px-4 py-2 font-semibold text-[#08101E] cursor-pointer">
                    Save Discount
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: MENTORS */}
          {tab === 'mentors' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Faculty & Mentors</h1>
                {mentors.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-[#D4A843]">
                        {m.mentor_code} · {m.assigned_courses_count || 0} Courses · {m.live_classes_count || 0} Classes
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-white">{m.full_name}</h3>
                      <p className="text-xs text-slate-400">
                        {m.email} · {m.specialization}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void handleIssueMentorCreds(m.id)}
                        className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#D4A843] cursor-pointer"
                      >
                        Issue Password
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void apiRequest(`/api/admin/mentors/${m.id}/status`, {
                            method: 'PATCH',
                            token,
                            body: { active: m.is_active !== 1 },
                          }).then(() => loadAll())
                        }
                        className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 cursor-pointer"
                      >
                        {m.is_active === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleCreateMentor} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Add Mentor</h2>
                <input
                  required
                  value={newMentor.fullName}
                  onChange={(e) => setNewMentor({ ...newMentor, fullName: e.target.value })}
                  placeholder="Full Name"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  type="email"
                  value={newMentor.email}
                  onChange={(e) => setNewMentor({ ...newMentor, email: e.target.value })}
                  placeholder="Mentor Email"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  value={newMentor.specialization}
                  onChange={(e) => setNewMentor({ ...newMentor, specialization: e.target.value })}
                  placeholder="Specialization"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  value={newMentor.qualification}
                  onChange={(e) => setNewMentor({ ...newMentor, qualification: e.target.value })}
                  placeholder="Qualification (e.g. CFA, MSc)"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <textarea
                  rows={2}
                  value={newMentor.bio}
                  onChange={(e) => setNewMentor({ ...newMentor, bio: e.target.value })}
                  placeholder="Mentor Bio"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Create Mentor & Issue Credentials
                </button>
              </form>
            </div>
          )}

          {/* TAB: CLASSES */}
          {tab === 'classes' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Live Online Classes</h1>
                {classes.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {c.class_date} · {c.start_time} · {c.meeting_platform} · {c.status}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-0.5">{c.title}</h3>
                      <p className="text-xs text-slate-400">{c.course_title}</p>
                    </div>
                    {c.meeting_link && (
                      <a
                        href={c.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-[#E5BE5C]"
                      >
                        Open Link
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleCreateClass} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Schedule Live Class</h2>
                <select
                  value={newClass.courseId}
                  onChange={(e) => setNewClass({ ...newClass, courseId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={newClass.title}
                  onChange={(e) => setNewClass({ ...newClass, title: e.target.value })}
                  placeholder="Session Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={newClass.classDate}
                    onChange={(e) => setNewClass({ ...newClass, classDate: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <input
                    type="time"
                    required
                    value={newClass.startTime}
                    onChange={(e) => setNewClass({ ...newClass, startTime: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                </div>
                <select
                  value={newClass.meetingPlatform}
                  onChange={(e) => setNewClass({ ...newClass, meetingPlatform: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  <option value="ZOOM">Zoom</option>
                  <option value="GOOGLE_MEET">Google Meet</option>
                </select>
                <input
                  required
                  value={newClass.meetingLink}
                  onChange={(e) => setNewClass({ ...newClass, meetingLink: e.target.value })}
                  placeholder="https://zoom.us/j/..."
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Schedule Session
                </button>
              </form>
            </div>
          )}

          {/* TAB: STUDY MATERIALS */}
          {tab === 'materials' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Protected Study Materials</h1>
                {materials.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {m.course_title} · {m.category}
                      </p>
                      <h3 className="text-sm font-semibold text-white">{m.title}</h3>
                      <p className="text-xs text-slate-400">{m.file_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void downloadProtectedFile(`/api/materials/${m.id}/download`, token, m.file_name)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-[#E5BE5C] cursor-pointer"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleUploadMaterial} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Upload Study Material</h2>
                <select
                  value={matCourseId}
                  onChange={(e) => setMatCourseId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="Material Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <select
                  value={matCategory}
                  onChange={(e) => setMatCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  <option value="PDF_NOTES">PDF Notes</option>
                  <option value="TRADING_STRATEGY">Trading Strategy</option>
                  <option value="TECHNICAL_DOC">Technical Analysis Document</option>
                  <option value="FUNDAMENTAL_DOC">Fundamental Analysis Document</option>
                  <option value="ASSIGNMENT">Course Assignment</option>
                </select>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
                  onChange={(e) => setMatFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-300"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Upload File
                </button>
              </form>
            </div>
          )}

          {/* TAB: ATTENDANCE */}
          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-xl font-bold text-white">Academy Attendance Ledger</h1>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadProtectedFile('/api/admin/export/attendance', token, 'attendance.xlsx')}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 cursor-pointer"
                  >
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadAttendanceReportPdf(
                        'Attendance Report',
                        attendance as Array<{ attendance_date: string; student_name?: string; course_title: string; status: string }>
                      )
                    }
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-[#E5BE5C] cursor-pointer"
                  >
                    Export PDF
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {attendance.map((a) => (
                      <tr key={String(a.id)}>
                        <td className="px-4 py-3 font-mono-tabular text-slate-300">{String(a.attendance_date)}</td>
                        <td className="px-4 py-3 text-white">{String(a.student_name)}</td>
                        <td className="px-4 py-3 text-slate-300">{String(a.course_title)}</td>
                        <td className="px-4 py-3 font-mono-tabular">{String(a.status)}</td>
                        <td className="px-4 py-3 text-slate-400">{String(a.remarks || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: REFERRALS */}
          {tab === 'referrals' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-white">Refer & Earn Reward Governance</h1>
                  <p className="text-xs text-slate-400 mt-1">{referralSettings.terms}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="number"
                    value={referralSettings.reward_amount}
                    onChange={(e) => setReferralSettings({ ...referralSettings, reward_amount: Number(e.target.value) })}
                    className="w-24 rounded-lg border border-slate-700 bg-[#08101E] px-3 py-1.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void apiRequest('/api/admin/referral-settings', {
                        method: 'PUT',
                        token,
                        body: { rewardAmount: referralSettings.reward_amount, terms: referralSettings.terms },
                      }).then(() => setNotice('Referral reward setting updated.'))
                    }
                    className="rounded-lg bg-[#D4A843] px-3 py-1.5 font-semibold text-[#08101E] cursor-pointer"
                  >
                    Update Reward ($)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D172A]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Referrer</th>
                      <th className="px-4 py-3">Referred Candidate</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Reward</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {referrals.map((r) => (
                      <tr key={String(r.id)}>
                        <td className="px-4 py-3">
                          {String(r.referrer_name)} ({String(r.referrer_code)})
                        </td>
                        <td className="px-4 py-3">
                          {String(r.referred_name)} · {String(r.referred_email)}
                        </td>
                        <td className="px-4 py-3 font-mono-tabular">{String(r.status)}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular">
                          ${Number(r.reward_amount || referralSettings.reward_amount)} ({String(r.reward_status || 'PENDING')})
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'QUALIFIED' && (
                            <button
                              type="button"
                              onClick={() =>
                                void apiRequest(`/api/admin/referrals/${r.id}/approve-reward`, { method: 'POST', token }).then(() =>
                                  loadAll()
                                )
                              }
                              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                            >
                              Approve Reward
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: BROKERS */}
          {tab === 'brokers' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Partner Broker Directory</h1>
                {brokers.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-[#D4A843]">{b.regulation_info}</p>
                      <h3 className="text-sm font-semibold text-white">{b.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{b.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void apiRequest(`/api/admin/brokers/${b.id}`, { method: 'DELETE', token }).then(() => loadAll())}
                      className="text-xs text-red-400 hover:underline h-fit cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleCreateBroker} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Add Broker Listing</h2>
                <input
                  required
                  value={newBroker.name}
                  onChange={(e) => setNewBroker({ ...newBroker, name: e.target.value })}
                  placeholder="Broker Name"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  value={newBroker.regulationInfo}
                  onChange={(e) => setNewBroker({ ...newBroker, regulationInfo: e.target.value })}
                  placeholder="Regulation Info"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <textarea
                  required
                  rows={2}
                  value={newBroker.description}
                  onChange={(e) => setNewBroker({ ...newBroker, description: e.target.value })}
                  placeholder="Broker Educational Description"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  value={newBroker.officialUrl}
                  onChange={(e) => setNewBroker({ ...newBroker, officialUrl: e.target.value })}
                  placeholder="Official URL (https://...)"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <input
                  required
                  value={newBroker.partnerUrl}
                  onChange={(e) => setNewBroker({ ...newBroker, partnerUrl: e.target.value })}
                  placeholder="Partner Link (https://...)"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Save Broker
                </button>
              </form>
            </div>
          )}

          {/* TAB: NOTIFICATIONS */}
          {tab === 'notifications' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h1 className="font-display text-xl font-bold text-white">Academy Announcements</h1>
                {notifications.map((n) => (
                  <div key={n.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                    <p className="text-xs font-mono-tabular text-[#D4A843]">
                      {n.category} · Target: {n.target_role}
                    </p>
                    <h3 className="text-sm font-semibold text-white mt-1">{n.title}</h3>
                    <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handlePublishNotification} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Publish Notification</h2>
                <input
                  required
                  value={newNotif.title}
                  onChange={(e) => setNewNotif({ ...newNotif, title: e.target.value })}
                  placeholder="Notification Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <select
                  value={newNotif.category}
                  onChange={(e) => setNewNotif({ ...newNotif, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  <option>New Course Available</option>
                  <option>New Batch Started</option>
                  <option>Class Schedule Updated</option>
                  <option>Payment Reminder</option>
                  <option>Examination Announced</option>
                  <option>Special Offers</option>
                </select>
                <select
                  value={newNotif.targetRole}
                  onChange={(e) => setNewNotif({ ...newNotif, targetRole: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  <option value="ALL">All Users</option>
                  <option value="STUDENT">Students Only</option>
                  <option value="MENTOR">Mentors Only</option>
                </select>
                <textarea
                  required
                  rows={3}
                  value={newNotif.message}
                  onChange={(e) => setNewNotif({ ...newNotif, message: e.target.value })}
                  placeholder="Announcement Details"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Publish Announcement
                </button>
              </form>
            </div>
          )}

          {/* TAB: REPORTS */}
          {tab === 'reports' && (
            <div className="space-y-4">
              <h1 className="font-display text-xl font-bold text-white">Excel (.xlsx) & PDF Institutional Reports</h1>
              <p className="text-xs text-slate-400">
                Generated directly from the primary relational database using ExcelJS and jsPDF.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  ['students', 'Student Records (.xlsx)'],
                  ['admissions', 'Admissions & Enrollment (.xlsx)'],
                  ['payments', 'Verified Payment Records (.xlsx)'],
                  ['pending-fees', 'Fee Ledger Report (.xlsx)'],
                  ['attendance', 'Attendance Register (.xlsx)'],
                  ['exam-results', 'Examination Results (.xlsx)'],
                  ['referrals', 'Referral Records (.xlsx)'],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => void downloadProtectedFile(`/api/admin/export/${type}`, token, `aurelia_${type}.xlsx`)}
                    className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 text-left hover:border-[#D4A843] transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="h-5 w-5 text-[#D4A843]" />
                    <p className="mt-3 text-sm font-semibold text-white">{label}</p>
                    <p className="mt-1 text-xs text-slate-400">Download workbook</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB: SECURITY & AUDIT */}
          {tab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                <h2 className="text-sm font-semibold text-white mb-3">System Audit Logs</h2>
                <div className="divide-y divide-slate-800 text-xs max-h-96 overflow-y-auto">
                  {auditLogs.map((l) => (
                    <div key={String(l.id)} className="py-2.5">
                      <p className="font-mono-tabular text-[#E5BE5C]">
                        {String(l.action)} · {String(l.actor_role)}
                      </p>
                      <p className="text-slate-300 mt-0.5">{String(l.details)}</p>
                      <p className="text-slate-500 text-[11px]">{String(l.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Authentication & Login History</h2>
                <div className="divide-y divide-slate-800 text-xs max-h-96 overflow-y-auto">
                  {loginHistory.map((h) => (
                    <div key={String(h.id)} className="py-2.5 flex justify-between gap-2">
                      <div>
                        <p className="text-white">{String(h.email)}</p>
                        <p className="text-slate-500 text-[11px]">{String(h.created_at)}</p>
                      </div>
                      <span className={h.status === 'SUCCESS' ? 'text-emerald-400 font-mono-tabular' : 'text-red-400 font-mono-tabular'}>
                        {String(h.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* One-Time Generated Credentials Modal */}
      {issuedCredentialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#D4A843]/50 bg-[#0D172A] p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white">{issuedCredentialModal.title}</h3>
            <p className="text-xs text-slate-300">
              Copy this one-time temporary password now. Only its salted cryptographic hash is stored in the database.
            </p>
            <div className="rounded-lg border border-slate-800 bg-[#08101E] p-4 font-mono-tabular text-xs space-y-2">
              <p>
                <span className="text-slate-400">Account ID:</span> <span className="text-[#E5BE5C]">{issuedCredentialModal.code}</span>
              </p>
              <p>
                <span className="text-slate-400">Username:</span> <span className="text-white">{issuedCredentialModal.username}</span>
              </p>
              <p>
                <span className="text-slate-400">Temporary Password:</span>{' '}
                <span className="text-emerald-400 font-semibold">{issuedCredentialModal.temporaryPassword}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssuedCredentialModal(null)}
              className="w-full rounded-lg bg-[#D4A843] py-2 text-xs font-semibold text-[#08101E] cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
