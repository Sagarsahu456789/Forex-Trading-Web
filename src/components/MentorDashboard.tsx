import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  HelpCircle,
  Lock,
  LogOut,
  Users,
  Video,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import type {
  AuthUser,
  CourseItem,
  DoubtItem,
  ExamItem,
  LiveClassItem,
  NotificationItem,
  StudyMaterialItem,
} from '../types/academy';

interface MentorDashboardProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
  onGoPublic: () => void;
}

type MentorTab = 'overview' | 'classes' | 'materials' | 'attendance' | 'exams' | 'doubts' | 'announcements' | 'security';

export function MentorDashboard({ token, user, onLogout, onGoPublic }: MentorDashboardProps) {
  const [tab, setTab] = useState<MentorTab>('overview');
  const [assignedCourses, setAssignedCourses] = useState<CourseItem[]>([]);
  const [students, setStudents] = useState<Array<Record<string, unknown>>>([]);
  const [classes, setClasses] = useState<LiveClassItem[]>([]);
  const [completedClasses, setCompletedClasses] = useState(0);
  const [materials, setMaterials] = useState<StudyMaterialItem[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Array<Record<string, unknown>>>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [doubts, setDoubts] = useState<DoubtItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Forms
  const [classForm, setClassForm] = useState({
    courseId: 0,
    title: '',
    description: '',
    classDate: new Date().toISOString().slice(0, 10),
    startTime: '14:00',
    durationMins: 60,
    meetingPlatform: 'ZOOM',
    meetingLink: 'https://zoom.us/j/8844221100',
  });
  const [recordingInput, setRecordingInput] = useState<Record<number, string>>({});

  const [matForm, setMatForm] = useState({ courseId: 0, title: '', category: 'PDF_NOTES', description: '' });
  const [matFile, setMatFile] = useState<File | null>(null);

  const [attCourseId, setAttCourseId] = useState(0);
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attStatuses, setAttStatuses] = useState<Record<number, 'PRESENT' | 'ABSENT' | 'LATE'>>({});

  // Exam Builder
  const [examForm, setExamForm] = useState({
    courseId: 0,
    title: '',
    description: '',
    durationMins: 20,
    passingMarks: 10,
    questions: [
      {
        text: '',
        marks: 5,
        options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ],
      },
    ],
  });

  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [announceForm, setAnnounceForm] = useState({ courseId: 0, title: '', message: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });

  const loadMentorData = useCallback(async () => {
    setError('');
    try {
      const [mRes, cRes, matRes, attRes, exRes, dRes, nRes] = await Promise.all([
        apiRequest<{
          assignedCourses: CourseItem[];
          students: Array<Record<string, unknown>>;
          completedClasses: number;
        }>('/api/mentor/dashboard', { token }),
        apiRequest<{ classes: LiveClassItem[] }>('/api/classes', { token }),
        apiRequest<{ materials: StudyMaterialItem[] }>('/api/materials', { token }),
        apiRequest<{ records: Array<Record<string, unknown>> }>('/api/attendance', { token }),
        apiRequest<{ exams: ExamItem[] }>('/api/exams', { token }),
        apiRequest<{ doubts: DoubtItem[] }>('/api/doubts', { token }),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
      ]);

      setAssignedCourses(mRes.assignedCourses);
      setStudents(mRes.students);
      setCompletedClasses(mRes.completedClasses);
      setClasses(cRes.classes);
      setMaterials(matRes.materials);
      setAttendanceRecords(attRes.records);
      setExams(exRes.exams);
      setDoubts(dRes.doubts);
      setNotifications(nRes.notifications);

      const firstCourseId = mRes.assignedCourses[0]?.id ?? 0;
      if (firstCourseId) {
        setClassForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
        setMatForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
        setAttCourseId((prev) => prev || firstCourseId);
        setExamForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
        setAnnounceForm((prev) => (prev.courseId ? prev : { ...prev, courseId: firstCourseId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load mentor workspace.');
    }
  }, [token]);

  useEffect(() => {
    void loadMentorData();
  }, [loadMentorData]);

  const handleScheduleClass = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/classes', { method: 'POST', token, body: classForm });
      setNotice('Live class scheduled.');
      setClassForm({ ...classForm, title: '', description: '' });
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule class.');
    }
  };

  const handleSaveRecording = async (classId: number) => {
    const url = recordingInput[classId];
    if (!url) return;
    try {
      await apiRequest(`/api/classes/${classId}/recordings`, { method: 'POST', token, body: { recordingUrl: url } });
      setNotice('Session recording uploaded.');
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload recording.');
    }
  };

  const handleUploadMaterial = async (e: FormEvent) => {
    e.preventDefault();
    if (!matFile) {
      setError('Attach a valid file.');
      return;
    }
    const fd = new FormData();
    fd.append('courseId', String(matForm.courseId));
    fd.append('title', matForm.title);
    fd.append('category', matForm.category);
    fd.append('description', matForm.description);
    fd.append('file', matFile);
    try {
      await apiRequest('/api/materials', { method: 'POST', token, body: fd, isFormData: true });
      setNotice('Study material uploaded.');
      setMatForm({ ...matForm, title: '', description: '' });
      setMatFile(null);
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleSaveAttendance = async () => {
    const courseStudents = students.filter((s) => Number(s.course_id) === attCourseId);
    if (courseStudents.length === 0) {
      setError('No enrolled students in selected course.');
      return;
    }
    const entries = courseStudents.map((s) => ({
      studentId: Number(s.id),
      status: attStatuses[Number(s.id)] || 'PRESENT',
      remarks: 'Marked by course mentor',
    }));
    try {
      await apiRequest('/api/attendance', {
        method: 'POST',
        token,
        body: { courseId: attCourseId, attendanceDate: attDate, entries },
      });
      setNotice(`Attendance saved for ${entries.length} students.`);
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance.');
    }
  };

  const handleCreateExam = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const totalMarks = examForm.questions.reduce((acc, q) => acc + Number(q.marks), 0);
      await apiRequest('/api/exams', {
        method: 'POST',
        token,
        body: { ...examForm, totalMarks },
      });
      setNotice('Examination paper created and published.');
      setExamForm({ ...examForm, title: '', description: '' });
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create exam.');
    }
  };

  const handleReplyDoubt = async (doubtId: number) => {
    const message = replyDrafts[doubtId];
    if (!message) return;
    try {
      await apiRequest(`/api/doubts/${doubtId}/reply`, { method: 'POST', token, body: { message } });
      setReplyDrafts({ ...replyDrafts, [doubtId]: '' });
      await loadMentorData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reply.');
    }
  };

  const navItems: Array<{ id: MentorTab; label: string; icon: typeof BookOpen }> = [
    { id: 'overview', label: 'Assigned Courses', icon: BookOpen },
    { id: 'classes', label: 'Live Classes', icon: Video },
    { id: 'materials', label: 'Study Materials', icon: Download },
    { id: 'attendance', label: 'Attendance', icon: CheckCircle2 },
    { id: 'exams', label: 'Online Exams', icon: ClipboardList },
    { id: 'doubts', label: 'Student Doubts', icon: HelpCircle },
    { id: 'announcements', label: 'Announcements', icon: Bell },
    { id: 'security', label: 'Account Security', icon: Lock },
  ];

  const courseStudentsForAttendance = students.filter((s) => Number(s.course_id) === attCourseId);

  return (
    <div className="min-h-screen bg-[#08101E] text-slate-100 flex">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-[#0A1323] hidden lg:flex flex-col justify-between p-4">
        <div>
          <div className="px-3 py-3 border-b border-slate-800">
            <p className="font-display text-base font-bold text-white">Aurelia FX Academy</p>
            <p className="text-xs text-[#D4A843] mt-0.5">Mentor Workspace</p>
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
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <button
            type="button"
            onClick={onGoPublic}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 cursor-pointer"
          >
            Public Website
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-slate-800 bg-[#0A1323] px-6 py-3.5 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            Mentor Desk <span aria-hidden="true">/</span> <span className="text-white font-medium">{user.fullName}</span>
          </p>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as MentorTab)}
            className="lg:hidden rounded-lg border border-slate-700 bg-[#08101E] px-2.5 py-1.5 text-xs text-white"
          >
            {navItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
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

          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Assigned Courses</p>
                  <p className="mt-1 font-mono-tabular text-2xl font-bold text-white">{assignedCourses.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Assigned Students</p>
                  <p className="mt-1 font-mono-tabular text-2xl font-bold text-white">{students.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Scheduled Classes</p>
                  <p className="mt-1 font-mono-tabular text-2xl font-bold text-white">
                    {classes.filter((c) => c.status !== 'COMPLETED').length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-slate-400">Completed Classes</p>
                  <p className="mt-1 font-mono-tabular text-2xl font-bold text-white">{completedClasses}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Assigned Trading Courses</h2>
                  <div className="space-y-3 text-xs">
                    {assignedCourses.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-800 bg-[#08101E] p-3.5">
                        <p className="font-semibold text-white">{c.title}</p>
                        <p className="text-slate-400 mt-1">{c.duration}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Assigned Cohort Students</h2>
                  <div className="divide-y divide-slate-800 text-xs">
                    {students.map((s, idx) => (
                      <div key={`${String(s.id)}-${idx}`} className="py-2.5 flex justify-between">
                        <div>
                          <p className="text-white font-medium">{String(s.full_name)}</p>
                          <p className="text-slate-400">{String(s.course_title)}</p>
                        </div>
                        <span className="font-mono-tabular text-[#E5BE5C]">{String(s.student_id_code)}</span>
                      </div>
                    ))}
                    {students.length === 0 && <p className="text-slate-400 py-4">No students enrolled in assigned courses yet.</p>}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'classes' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Your Scheduled & Completed Sessions</h2>
                {classes.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono-tabular text-slate-400">
                          {c.class_date} · {c.start_time} · {c.meeting_platform} · {c.status}
                        </p>
                        <h3 className="text-sm font-semibold text-white">{c.title}</h3>
                        <p className="text-xs text-slate-400">{c.course_title}</p>
                      </div>
                      {c.meeting_link && (
                        <a
                          href={c.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-slate-700 px-3 py-1 text-xs text-[#E5BE5C]"
                        >
                          Launch
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 text-xs">
                      <input
                        value={recordingInput[c.id] || ''}
                        onChange={(e) => setRecordingInput({ ...recordingInput, [c.id]: e.target.value })}
                        placeholder="Add recorded replay URL (https://...)"
                        className="flex-1 rounded-lg border border-slate-700 bg-[#08101E] px-3 py-1.5 text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveRecording(c.id)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-[#D4A843] cursor-pointer"
                      >
                        Upload Replay
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleScheduleClass} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs">
                <h3 className="font-display text-base font-bold text-white">Schedule Live Class</h3>
                <select
                  value={classForm.courseId}
                  onChange={(e) => setClassForm({ ...classForm, courseId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {assignedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={classForm.title}
                  onChange={(e) => setClassForm({ ...classForm, title: e.target.value })}
                  placeholder="Class Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <textarea
                  rows={2}
                  value={classForm.description}
                  onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
                  placeholder="Session Description"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={classForm.classDate}
                    onChange={(e) => setClassForm({ ...classForm, classDate: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <input
                    type="time"
                    required
                    value={classForm.startTime}
                    onChange={(e) => setClassForm({ ...classForm, startTime: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                </div>
                <select
                  value={classForm.meetingPlatform}
                  onChange={(e) => setClassForm({ ...classForm, meetingPlatform: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  <option value="ZOOM">Zoom</option>
                  <option value="GOOGLE_MEET">Google Meet</option>
                </select>
                <input
                  required
                  value={classForm.meetingLink}
                  onChange={(e) => setClassForm({ ...classForm, meetingLink: e.target.value })}
                  placeholder="https://zoom.us/j/..."
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Schedule Session
                </button>
              </form>
            </div>
          )}

          {tab === 'materials' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Course Study Materials</h2>
                {materials.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4 flex justify-between items-center gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-slate-400">
                        {m.course_title} · {m.category}
                      </p>
                      <h3 className="text-sm font-semibold text-white">{m.title}</h3>
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
                <h3 className="font-display text-base font-bold text-white">Upload PDF Notes or Strategy Doc</h3>
                <select
                  value={matForm.courseId}
                  onChange={(e) => setMatForm({ ...matForm, courseId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {assignedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={matForm.title}
                  onChange={(e) => setMatForm({ ...matForm, title: e.target.value })}
                  placeholder="Document Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <select
                  value={matForm.category}
                  onChange={(e) => setMatForm({ ...matForm, category: e.target.value })}
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
                  Upload Material
                </button>
              </form>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-6 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h2 className="font-display text-lg font-bold text-white">Mark Daily Cohort Attendance</h2>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <select
                      value={attCourseId}
                      onChange={(e) => setAttCourseId(Number(e.target.value))}
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    >
                      {assignedCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={attDate}
                      onChange={(e) => setAttDate(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-800 text-xs">
                  {courseStudentsForAttendance.map((s) => {
                    const sid = Number(s.id);
                    const current = attStatuses[sid] || 'PRESENT';
                    return (
                      <div key={sid} className="py-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-white">{String(s.full_name)}</p>
                          <p className="font-mono-tabular text-slate-400">{String(s.student_id_code)}</p>
                        </div>
                        <div className="flex gap-2">
                          {(['PRESENT', 'LATE', 'ABSENT'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setAttStatuses({ ...attStatuses, [sid]: st })}
                              className={`rounded-lg px-3 py-1.5 font-semibold cursor-pointer ${
                                current === st
                                  ? st === 'PRESENT'
                                    ? 'bg-emerald-600 text-white'
                                    : st === 'LATE'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-red-600 text-white'
                                  : 'border border-slate-700 text-slate-300'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {courseStudentsForAttendance.length === 0 && (
                    <p className="py-4 text-slate-400">No students enrolled in this course yet.</p>
                  )}
                </div>

                {courseStudentsForAttendance.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleSaveAttendance()}
                    className="rounded-lg bg-[#D4A843] px-5 py-2.5 text-xs font-semibold text-[#08101E] cursor-pointer"
                  >
                    Save Attendance Register
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Recent Attendance Records</h3>
                <div className="divide-y divide-slate-800 text-xs">
                  {attendanceRecords.slice(0, 12).map((r) => (
                    <div key={String(r.id)} className="py-2 flex justify-between">
                      <span>
                        {String(r.attendance_date)} · {String(r.student_name)} ({String(r.course_title)})
                      </span>
                      <span className="font-mono-tabular text-[#E5BE5C]">{String(r.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'exams' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Published Examinations</h2>
                {exams.map((ex) => (
                  <div key={ex.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                    <p className="text-xs font-mono-tabular text-[#D4A843]">
                      {ex.course_title} · {ex.duration_mins} mins · {ex.question_count} Questions
                    </p>
                    <h3 className="text-sm font-semibold text-white mt-1">{ex.title}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Passing: {ex.passing_marks} / {ex.total_marks} Marks
                    </p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateExam} className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0D172A] p-6 space-y-4 text-xs">
                <h2 className="font-display text-lg font-bold text-white">Create Online MCQ Examination</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={examForm.courseId}
                    onChange={(e) => setExamForm({ ...examForm, courseId: Number(e.target.value) })}
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  >
                    {assignedCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    value={examForm.title}
                    onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                    placeholder="Exam Title"
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <input
                    type="number"
                    required
                    value={examForm.durationMins}
                    onChange={(e) => setExamForm({ ...examForm, durationMins: Number(e.target.value) })}
                    placeholder="Duration (mins)"
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                  <input
                    type="number"
                    required
                    value={examForm.passingMarks}
                    onChange={(e) => setExamForm({ ...examForm, passingMarks: Number(e.target.value) })}
                    placeholder="Passing Marks"
                    className="rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                  />
                </div>

                {examForm.questions.map((q, qIdx) => (
                  <div key={qIdx} className="rounded-lg border border-slate-800 bg-[#08101E] p-4 space-y-2.5">
                    <p className="font-semibold text-[#E5BE5C]">Question {qIdx + 1}</p>
                    <input
                      required
                      value={q.text}
                      onChange={(e) => {
                        const copy = [...examForm.questions];
                        copy[qIdx].text = e.target.value;
                        setExamForm({ ...examForm, questions: copy });
                      }}
                      placeholder="Question prompt"
                      className="w-full rounded-lg border border-slate-700 bg-[#0D172A] px-3 py-2 text-white"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`q-${qIdx}-correct`}
                            checked={opt.isCorrect}
                            onChange={() => {
                              const copy = [...examForm.questions];
                              copy[qIdx].options = copy[qIdx].options.map((o, i) => ({ ...o, isCorrect: i === oIdx }));
                              setExamForm({ ...examForm, questions: copy });
                            }}
                          />
                          <input
                            required
                            value={opt.text}
                            onChange={(e) => {
                              const copy = [...examForm.questions];
                              copy[qIdx].options[oIdx].text = e.target.value;
                              setExamForm({ ...examForm, questions: copy });
                            }}
                            placeholder={`Option ${oIdx + 1}`}
                            className="flex-1 rounded-lg border border-slate-700 bg-[#0D172A] px-2.5 py-1.5 text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExamForm({
                        ...examForm,
                        questions: [
                          ...examForm.questions,
                          {
                            text: '',
                            marks: 5,
                            options: [
                              { text: '', isCorrect: true },
                              { text: '', isCorrect: false },
                              { text: '', isCorrect: false },
                              { text: '', isCorrect: false },
                            ],
                          },
                        ],
                      })
                    }
                    className="rounded-lg border border-slate-700 px-3.5 py-2 text-slate-200 cursor-pointer"
                  >
                    + Add Question
                  </button>
                  <button type="submit" className="rounded-lg bg-[#D4A843] px-5 py-2 font-semibold text-[#08101E] cursor-pointer">
                    Publish Exam Paper
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === 'doubts' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold text-white">Student Doubt Support Queue</h2>
              {doubts.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-5 space-y-3">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono-tabular text-[#D4A843]">
                        {d.student_name} ({d.student_id_code}) · {d.course_title} · Status: {d.status}
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-1">{d.title}</h3>
                      <p className="text-xs text-slate-300 mt-1">{d.description}</p>
                    </div>
                    {d.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        onClick={() =>
                          void apiRequest(`/api/doubts/${d.id}/status`, { method: 'PATCH', token, body: { status: 'RESOLVED' } }).then(() =>
                            loadMentorData()
                          )
                        }
                        className="rounded border border-emerald-600/60 px-3 py-1 text-xs text-emerald-300 h-fit cursor-pointer"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
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
                      value={replyDrafts[d.id] || ''}
                      onChange={(e) => setReplyDrafts({ ...replyDrafts, [d.id]: e.target.value })}
                      placeholder="Write technical explanation or reply..."
                      className="flex-1 rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleReplyDoubt(d.id)}
                      className="rounded-lg bg-[#D4A843] px-4 py-2 font-semibold text-[#08101E] cursor-pointer"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))}
              {doubts.length === 0 && <p className="text-xs text-slate-400">No student doubts assigned yet.</p>}
            </div>
          )}

          {tab === 'announcements' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Recent Announcements</h2>
                {notifications.map((n) => (
                  <div key={n.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-4">
                    <p className="text-xs text-[#D4A843]">{n.category}</p>
                    <h3 className="text-sm font-semibold text-white mt-1">{n.title}</h3>
                    <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void apiRequest('/api/notifications', {
                    method: 'POST',
                    token,
                    body: { ...announceForm, category: 'Mentor Course Update', targetRole: 'STUDENT' },
                  }).then(() => {
                    setAnnounceForm({ ...announceForm, title: '', message: '' });
                    setNotice('Course announcement sent to enrolled students.');
                    return loadMentorData();
                  });
                }}
                className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-6 h-fit space-y-3 text-xs"
              >
                <h3 className="font-display text-base font-bold text-white">Publish Course Announcement</h3>
                <select
                  value={announceForm.courseId}
                  onChange={(e) => setAnnounceForm({ ...announceForm, courseId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                >
                  {assignedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={announceForm.title}
                  onChange={(e) => setAnnounceForm({ ...announceForm, title: e.target.value })}
                  placeholder="Announcement Title"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <textarea
                  required
                  rows={3}
                  value={announceForm.message}
                  onChange={(e) => setAnnounceForm({ ...announceForm, message: e.target.value })}
                  placeholder="Message for students"
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3 py-2 text-white"
                />
                <button type="submit" className="w-full rounded-lg bg-[#D4A843] py-2.5 font-semibold text-[#08101E] cursor-pointer">
                  Publish Announcement
                </button>
              </form>
            </div>
          )}

          {tab === 'security' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void apiRequest('/api/auth/change-password', { method: 'POST', token, body: pwForm })
                  .then(() => {
                    setPwForm({ currentPassword: '', newPassword: '' });
                    setNotice('Password changed successfully.');
                  })
                  .catch((err) => setError(err instanceof Error ? err.message : 'Unable to update password.'));
              }}
              className="max-w-md rounded-xl border border-slate-800 bg-[#0D172A] p-6 space-y-3 text-xs"
            >
              <h2 className="font-display text-lg font-bold text-white">Change Account Password</h2>
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
          )}
        </main>
      </div>
    </div>
  );
}
