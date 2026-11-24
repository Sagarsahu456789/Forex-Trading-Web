import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  ShieldAlert,
  Users,
  Video,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { downloadCourseSyllabusPdf } from '../lib/pdf';
import type {
  AuthUser,
  BrokerItem,
  CourseItem,
  EventItem,
  GalleryItem,
  LiveClassItem,
  MentorItem,
  OfferItem,
} from '../types/academy';

interface PublicPortalProps {
  courses: CourseItem[];
  mentors: MentorItem[];
  offers: OfferItem[];
  events: EventItem[];
  gallery: GalleryItem[];
  brokers: BrokerItem[];
  publicClasses: LiveClassItem[];
  currentUser: AuthUser | null;
  onOpenAuth: (initialMode?: 'LOGIN' | 'REGISTER', roleHint?: 'STUDENT' | 'MENTOR' | 'ADMIN') => void;
  onOpenDashboard: () => void;
}

export function PublicPortal({
  courses,
  mentors,
  offers,
  events,
  gallery,
  brokers,
  publicClasses,
  currentUser,
  onOpenAuth,
  onOpenDashboard,
}: PublicPortalProps) {
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [admissionCourseId, setAdmissionCourseId] = useState<number>(courses[0]?.id ?? 1);

  const [admForm, setAdmForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    address: '',
    dob: '',
    discountCode: '',
    referredByCode: '',
    meetingDate: '',
    meetingTime: '10:30',
    meetingReason: 'Program curriculum & schedule consultation',
    remarks: '',
  });
  const [admSubmitting, setAdmSubmitting] = useState(false);
  const [admError, setAdmError] = useState('');
  const [admSuccess, setAdmSuccess] = useState<{ admissionNo: string; courseTitle: string; finalFees: number } | null>(null);

  const [contactForm, setContactForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    subject: 'Cohort Admissions Inquiry',
    message: '',
  });
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState('');

  const handleEnrollClick = (course: CourseItem) => {
    setAdmissionCourseId(course.id);
    setSelectedCourse(null);
    const el = document.getElementById('admission-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAdmissionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAdmError('');
    setAdmSuccess(null);
    setAdmSubmitting(true);
    try {
      const res = await apiRequest<{ admissionNo: string; courseTitle: string; finalFees: number }>('/api/public/admissions', {
        method: 'POST',
        body: { ...admForm, courseId: admissionCourseId || courses[0]?.id },
      });
      setAdmSuccess(res);
      setAdmForm({
        fullName: '',
        email: '',
        mobile: '',
        address: '',
        dob: '',
        discountCode: '',
        referredByCode: '',
        meetingDate: '',
        meetingTime: '10:30',
        meetingReason: 'Program curriculum & schedule consultation',
        remarks: '',
      });
    } catch (err) {
      setAdmError(err instanceof Error ? err.message : 'Unable to submit admission request.');
    } finally {
      setAdmSubmitting(false);
    }
  };

  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setContactError('');
    setContactSuccess(false);
    try {
      await apiRequest('/api/public/contact', { method: 'POST', body: contactForm });
      setContactSuccess(true);
      setContactForm({ fullName: '', email: '', phone: '', subject: 'Cohort Admissions Inquiry', message: '' });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Unable to send inquiry.');
    }
  };

  const activeAdmissionCourse = courses.find((c) => c.id === admissionCourseId) || courses[0];

  return (
    <div className="min-h-screen bg-[#08101E] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#08101E]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4">
          <a href="#top" className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            Aurelia FX Academy
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#courses" className="hover:text-[#E5BE5C] transition-colors whitespace-nowrap shrink-0">
              Courses
            </a>
            <a href="#mentors" className="hover:text-[#E5BE5C] transition-colors whitespace-nowrap shrink-0">
              Mentors
            </a>
            <a href="#classes" className="hover:text-[#E5BE5C] transition-colors whitespace-nowrap shrink-0">
              Classes
            </a>
            <a href="#brokers" className="hover:text-[#E5BE5C] transition-colors whitespace-nowrap shrink-0">
              Brokers
            </a>
            <a href="#about" className="hover:text-[#E5BE5C] transition-colors whitespace-nowrap shrink-0">
              About
            </a>
          </nav>

          <div className="shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="rounded-lg bg-[#D4A843] px-4 py-2 text-xs font-semibold text-[#08101E] hover:bg-[#E5BE5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('LOGIN', 'STUDENT')}
                className="rounded-lg bg-[#D4A843] px-4 py-2 text-xs font-semibold text-[#08101E] hover:bg-[#E5BE5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Portal Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Split Section */}
      <section id="top" className="mx-auto max-w-[1360px] px-6 pt-12 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D172A] p-8 lg:p-10">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#D4A843]">
                Institutional Currency Education · Cohort Intake Open
              </p>
              <h1
                className="mt-4 font-display font-bold tracking-tight text-white balance-headline"
                style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.4rem)', lineHeight: 1.12 }}
              >
                Structured Forex education built on institutional risk discipline.
              </h1>
              <p className="mt-5 text-base leading-relaxed text-slate-300 max-w-xl">
                Master interbank currency mechanics, multi-timeframe technical structure, central bank macro cycles, and
                verifiable risk sizing through mentor-led live sessions and proctored assessments.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#admission-section"
                className="inline-flex items-center gap-2 rounded-lg bg-[#D4A843] px-5 py-3 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] transition-colors whitespace-nowrap shrink-0"
              >
                Apply for Admission
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => onOpenAuth('REGISTER', 'STUDENT')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Student Registration
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 relative overflow-hidden rounded-xl border border-slate-800 bg-[#0B1322] min-h-[340px]">
            <img
              src="/src/assets/images/hero_trading_desk_1795518343915.jpg"
              alt="Aurelia FX Academy institutional trading floor"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08101E]/85 via-[#08101E]/25 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="text-xs text-[#E5BE5C]">London & New York Session Desk Training</p>
              <p className="mt-1 text-sm text-slate-200">
                Cohort workshops integrate live chart reviews, quantitative risk worksheets, and timed MCQ evaluations.
              </p>
            </div>
          </div>
        </div>

        {/* 4-Column Overview Strip below Hero */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-800 bg-[#0D172A] px-5 py-4">
            <p className="text-xs text-slate-400">Curriculum Tracks</p>
            <p className="mt-1 font-mono-tabular text-xl font-semibold text-white">{courses.length} Specialized Courses</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#0D172A] px-5 py-4">
            <p className="text-xs text-slate-400">Live Instruction</p>
            <p className="mt-1 font-mono-tabular text-xl font-semibold text-white">Zoom & Meet Sessions</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#0D172A] px-5 py-4">
            <p className="text-xs text-slate-400">Competency Checks</p>
            <p className="mt-1 font-mono-tabular text-xl font-semibold text-white">Timed MCQ Examinations</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#0D172A] px-5 py-4">
            <p className="text-xs text-slate-400">Billing Transparency</p>
            <p className="mt-1 font-mono-tabular text-xl font-semibold text-white">Verified PDF Receipts</p>
          </div>
        </div>
      </section>

      {/* Active Offers Strip (Unboxed clean hairline bar) */}
      {offers.length > 0 && (
        <section className="mx-auto max-w-[1360px] px-6 py-4">
          <div className="rounded-lg border border-[#D4A843]/30 bg-[#0F1B2E] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#E5BE5C]">{offers[0].title}</p>
              <p className="text-xs text-slate-300 mt-0.5">{offers[0].description}</p>
            </div>
            <p className="font-mono-tabular text-xs text-slate-300 shrink-0">
              Code: <span className="text-white font-semibold">AURELIA10</span> · Valid through {offers[0].valid_until}
            </p>
          </div>
        </section>
      )}

      {/* About & Why Choose Us + Attributable Proof */}
      <section id="about" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6">
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-white balance-headline">
              Why serious currency students train at Aurelia FX Academy
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Retail traders fail when they treat spot currency markets as guesswork. Our curriculum enforces position
              sizing mathematics, macro policy literacy, and documented trade review before capital is ever committed.
            </p>
            <div className="mt-8 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">01. Progression from Foundations to Desk Execution</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Five sequential programs take students from basic pip valuation to multi-pair portfolio correlation.
                </p>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">02. Verified Attendance, Materials & Examinations</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Every cohort tracks daily attendance, downloadable strategy handbooks, and timed online exams inside one
                  student portal.
                </p>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">03. Transparent Tuition & Server-Verified Receipts</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Full and installment tuition payments undergo cryptographic server verification and generate downloadable
                  PDF receipts automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Attributable Student Testimonials placed adjacent */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#D4A843]">Verified Graduate Outcomes</h3>
            <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-6">
              <p className="text-sm leading-relaxed text-slate-200">
                "Before enrolling in Technical Analysis and Risk Protocols, I oversized positions during news spikes. After 8
                weeks of structured H4/H1 drills and mentor feedback, my demo journal stabilized at a 1.9R average expectancy
                across 40 logged trades."
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Aarav Mehta · Cohort 2026 Graduate, Forex Beginner & Technical Analysis · New York
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-6">
              <p className="text-sm leading-relaxed text-slate-200">
                "The Fundamental Analysis track gave me a repeatable framework to read 2-year sovereign yield spreads ahead
                of ECB and FOMC announcements instead of chasing post-release candles."
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Sophia Lindqvist · Quantitative FX Cohort Member · London
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Five Default Trading Courses + Unlimited Dynamic Courses */}
      <section id="courses" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-white">Academy Curriculum</h2>
            <p className="mt-2 text-sm text-slate-400">
              Select a structured trading course to inspect its full module syllabus or submit an admission application.
            </p>
          </div>
          <p className="font-mono-tabular text-xs text-slate-400">{courses.length} Active Programs</p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <article
              key={course.id}
              className="flex flex-col rounded-xl border border-slate-800 bg-[#0D172A] overflow-hidden hover:border-slate-700 transition-colors"
            >
              <div className="aspect-[4/3] w-full bg-[#091221] overflow-hidden relative">
                <img
                  src={course.image_url || '/src/assets/images/course_forex_beginner_1795518344034.jpg'}
                  alt={course.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0D172A]/80 via-transparent to-transparent" />
              </div>

              <div className="flex-1 p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-mono-tabular">
                    {course.duration} · Mentor: {course.mentor_name || 'Academy Faculty'}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-white">{course.title}</h3>
                  <p className="mt-2 text-sm text-slate-300 line-clamp-3">{course.description}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono-tabular text-lg font-bold text-[#E5BE5C]">${course.discounted_fees}</span>
                    {course.fees > course.discounted_fees && (
                      <span className="ml-2 font-mono-tabular text-xs text-slate-500 line-through">${course.fees}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCourse(course)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEnrollClick(course)}
                      className="rounded-lg bg-[#D4A843] px-3.5 py-2 text-xs font-semibold text-[#08101E] hover:bg-[#E5BE5C] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Enroll Now
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Mentors Section */}
      <section id="mentors" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <h2 className="font-display text-2xl lg:text-3xl font-bold text-white">Senior Trading Mentors</h2>
        <p className="mt-2 text-sm text-slate-400">
          Direct desk guidance from practitioners with institutional spot FX and macro research backgrounds.
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {mentors.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-6 flex flex-col sm:flex-row gap-6">
              <div className="h-28 w-28 shrink-0 rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                <img
                  src={m.avatar_url || '/src/assets/images/mentor_portrait_male_1795518344158.jpg'}
                  alt={m.full_name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-[#D4A843] font-mono-tabular">
                  {m.mentor_code} · {m.experience_years} Years Experience
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-white">{m.full_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{m.qualification}</p>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">{m.bio}</p>
                <p className="mt-3 text-xs text-slate-400">Focus: {m.specialization}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live Online Classes & Events / Gallery */}
      <section id="classes" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6">
            <h2 className="font-display text-2xl font-bold text-white">Upcoming Live Sessions</h2>
            <p className="mt-2 text-sm text-slate-400">
              Meeting links and session replays are accessible inside the Student Portal for enrolled learners.
            </p>
            <div className="mt-6 space-y-3">
              {publicClasses.map((cls) => (
                <div key={cls.id} className="rounded-lg border border-slate-800 bg-[#0D172A] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400 font-mono-tabular">
                      {cls.class_date} · {cls.start_time} · {cls.meeting_platform.replace('_', ' ')}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">{cls.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {cls.course_title} · {cls.mentor_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('LOGIN', 'STUDENT')}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-[#D4A843] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Student Access
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <h2 className="font-display text-2xl font-bold text-white">Upcoming Events & Campus Gallery</h2>
            <p className="mt-2 text-sm text-slate-400">Workshops, macro seminars, and study floor facilities.</p>
            <div className="mt-6 space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="rounded-lg border border-slate-800 bg-[#0D172A] p-4">
                  <p className="text-xs text-[#D4A843] font-mono-tabular">
                    {ev.event_date} · {ev.location} · {ev.category}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-white">{ev.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{ev.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {gallery.slice(0, 3).map((g) => (
                <div key={g.id} className="rounded-lg overflow-hidden border border-slate-800 bg-[#0D172A]">
                  <img
                    src={g.image_url}
                    alt={g.title}
                    referrerPolicy="no-referrer"
                    className="h-24 w-full object-cover"
                  />
                  <p className="p-2 text-[11px] text-slate-300 truncate">{g.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Broker Information with Mandatory Affiliate & Financial Risk Disclosures */}
      <section id="brokers" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-white">Forex Broker Educational Directory</h2>
            <p className="mt-2 text-sm text-slate-400">
              Reference venues used for educational demo simulation, spread analysis, and order-type mechanics.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex items-start gap-4">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-amber-100/90 space-y-1">
            <p className="font-semibold text-amber-300">Affiliate Disclosure & Financial Risk Warning</p>
            <p>
              Aurelia FX Academy may receive partner compensation when students open accounts via partner links listed
              below. Trading foreign exchange on margin carries a high level of risk and may not be suitable for all
              individuals. No broker is guaranteed safe, and education does not guarantee trading profits. Always verify
              regulatory status independently and practice on demo accounts first.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {brokers.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-800 bg-[#0D172A] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-mono-tabular text-slate-400">
                    {b.regulation_info} · Min: {b.min_deposit} · {b.leverage_info}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-white">{b.name}</h3>
                </div>
                <span className="font-mono-tabular text-sm font-bold text-[#D4A843]">{b.logo_text}</span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{b.description}</p>
              <p className="mt-2 text-xs text-slate-400">{b.educational_notes}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={b.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-slate-500"
                >
                  Official Site <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={b.partner_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-[#E5BE5C] hover:bg-slate-700"
                >
                  Partner Sandbox Link (Affiliate) <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Refer & Earn Overview */}
      <section id="refer" className="mx-auto max-w-[1360px] px-6 py-12 border-t border-slate-800/80">
        <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Student Refer & Earn Program</h2>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Enrolled students receive a personal referral code inside their dashboard. When a referred applicant completes
              verified admission and initial tuition clearance, the referral qualifies for an Admin-approved $100 tuition
              credit or reward.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAuth('LOGIN', 'STUDENT')}
            className="rounded-lg border border-[#D4A843] px-4 py-2.5 text-xs font-semibold text-[#E5BE5C] hover:bg-[#D4A843] hover:text-[#08101E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            View My Referral Link
          </button>
        </div>
      </section>

      {/* Admission Form + Contact Form */}
      <section id="admission-section" className="mx-auto max-w-[1360px] px-6 py-14 border-t border-slate-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Student Admission & Consultation Application */}
          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0D172A] p-8">
            <h2 className="font-display text-2xl font-bold text-white">Student Admission Application</h2>
            <p className="mt-1 text-sm text-slate-400">
              Submit your enrollment request. Once approved by Administration, your unique Student ID and portal credentials
              are issued automatically.
            </p>

            {admSuccess && (
              <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm text-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Admission Application Submitted ({admSuccess.admissionNo})</p>
                  <p className="text-xs mt-1 text-emerald-200/80">
                    Course: {admSuccess.courseTitle} · Assessed Tuition: ${admSuccess.finalFees} USD. Our Admissions Desk
                    will review and approve your profile shortly.
                  </p>
                </div>
              </div>
            )}
            {admError && <p className="mt-4 rounded-lg bg-red-950/60 border border-red-500/40 p-3 text-xs text-red-200">{admError}</p>}

            <form onSubmit={handleAdmissionSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                <input
                  required
                  value={admForm.fullName}
                  onChange={(e) => setAdmForm({ ...admForm, fullName: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="Jordan Ellis"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                <input
                  required
                  type="email"
                  value={admForm.email}
                  onChange={(e) => setAdmForm({ ...admForm, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="jordan@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Number *</label>
                <input
                  required
                  value={admForm.mobile}
                  onChange={(e) => setAdmForm({ ...admForm, mobile: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="+1-555-0192"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={admForm.dob}
                  onChange={(e) => setAdmForm({ ...admForm, dob: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Selected Course *</label>
                <select
                  value={admissionCourseId}
                  onChange={(e) => setAdmissionCourseId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.duration} — ${c.discounted_fees})
                    </option>
                  ))}
                </select>
              </div>
              {activeAdmissionCourse && (
                <div className="sm:col-span-2 rounded-lg border border-slate-800 bg-[#08101E] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                  <span>Duration: {activeAdmissionCourse.duration}</span>
                  <span>Standard Fee: ${activeAdmissionCourse.fees}</span>
                  <span className="font-semibold text-[#E5BE5C]">Cohort Fee: ${activeAdmissionCourse.discounted_fees}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Discount Code (Optional)</label>
                <input
                  value={admForm.discountCode}
                  onChange={(e) => setAdmForm({ ...admForm, discountCode: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="AURELIA10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Referral Code (Optional)</label>
                <input
                  value={admForm.referredByCode}
                  onChange={(e) => setAdmForm({ ...admForm, referredByCode: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="REF-FXA-1001"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Preferred Meeting Date</label>
                <input
                  type="date"
                  value={admForm.meetingDate}
                  onChange={(e) => setAdmForm({ ...admForm, meetingDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Preferred Meeting Time</label>
                <input
                  type="time"
                  value={admForm.meetingTime}
                  onChange={(e) => setAdmForm({ ...admForm, meetingTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Address / City</label>
                <input
                  value={admForm.address}
                  onChange={(e) => setAdmForm({ ...admForm, address: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="City, Country"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">Meeting Reason & Remarks</label>
                <textarea
                  rows={2}
                  value={admForm.remarks}
                  onChange={(e) => setAdmForm({ ...admForm, remarks: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="Share trading background or preferred batch timing"
                />
              </div>
              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={admSubmitting}
                  className="w-full rounded-lg bg-[#D4A843] px-5 py-3 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {admSubmitting ? 'Submitting Application...' : 'Submit Admission Application'}
                </button>
              </div>
            </form>
          </div>

          {/* Contact Us Form */}
          <div id="contact" className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D172A] p-8 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Contact Admissions Desk</h2>
              <p className="mt-1 text-sm text-slate-400">
                Questions regarding corporate cohorts, installment plans, or mentor schedules.
              </p>

              {contactSuccess && (
                <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                  Inquiry received. An academy counselor will respond via email.
                </div>
              )}
              {contactError && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">{contactError}</div>
              )}

              <form onSubmit={handleContactSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Your Name *</label>
                  <input
                    required
                    value={contactForm.fullName}
                    onChange={(e) => setContactForm({ ...contactForm, fullName: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email *</label>
                  <input
                    required
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Subject</label>
                  <input
                    value={contactForm.subject}
                    onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Message *</label>
                  <textarea
                    required
                    rows={4}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-sm font-medium text-white hover:border-[#D4A843] transition-colors cursor-pointer"
                >
                  Send Inquiry
                </button>
              </form>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-400 space-y-1">
              <p>Admissions Office: admissions@aureliafx.edu</p>
              <p>London & New York Cohort Support · Mon–Fri 08:00–19:00 UTC</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer with Role Portals */}
      <footer className="border-t border-slate-800 bg-[#060C17] py-12">
        <div className="mx-auto max-w-[1360px] px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-xs text-slate-400">
          <div>
            <p className="font-display text-sm font-bold text-white">Aurelia FX Academy</p>
            <p className="mt-2 leading-relaxed">
              Structured financial market education, risk management training, and academy administration platform.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-200">Public Directory</p>
            <div className="flex flex-col gap-1.5">
              <a href="#courses" className="hover:text-white">Courses & Syllabus</a>
              <a href="#mentors" className="hover:text-white">Our Mentors</a>
              <a href="#classes" className="hover:text-white">Online Classes & Events</a>
              <a href="#brokers" className="hover:text-white">Broker Information</a>
              <a href="#refer" className="hover:text-white">Refer & Earn</a>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-200">Academy Portals</p>
            <div className="flex flex-col items-start gap-1.5">
              <button type="button" onClick={() => onOpenAuth('LOGIN', 'STUDENT')} className="hover:text-white cursor-pointer">
                Student Login
              </button>
              <button type="button" onClick={() => onOpenAuth('REGISTER', 'STUDENT')} className="hover:text-white cursor-pointer">
                Student Registration
              </button>
              <button type="button" onClick={() => onOpenAuth('LOGIN', 'MENTOR')} className="hover:text-white cursor-pointer">
                Mentor Login
              </button>
              <button type="button" onClick={() => onOpenAuth('LOGIN', 'ADMIN')} className="hover:text-white cursor-pointer">
                Admin Login
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-200">Risk & Compliance</p>
            <p className="leading-relaxed">
              Educational content only. Spot foreign exchange carries substantial risk of loss. Past simulation metrics do
              not indicate future results.
            </p>
          </div>
        </div>
      </footer>

      {/* Course Details Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-[#0D172A] p-6 lg:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono-tabular text-[#D4A843]">
                  {selectedCourse.duration} · Mentor: {selectedCourse.mentor_name || 'Faculty'}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold text-white">{selectedCourse.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close course details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">{selectedCourse.description}</p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#D4A843]" /> Course Syllabus
                </h4>
                <ul className="mt-3 space-y-2 text-xs text-slate-300">
                  {selectedCourse.syllabus.map((item, i) => (
                    <li key={i} className="leading-relaxed">• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-[#D4A843]" /> Learning Outcomes
                </h4>
                <ul className="mt-3 space-y-2 text-xs text-slate-300">
                  {selectedCourse.outcomes.map((item, i) => (
                    <li key={i} className="leading-relaxed">• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono-tabular text-xl font-bold text-[#E5BE5C]">${selectedCourse.discounted_fees}</span>
                {selectedCourse.fees > selectedCourse.discounted_fees && (
                  <span className="ml-2 font-mono-tabular text-xs text-slate-500 line-through">${selectedCourse.fees}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => downloadCourseSyllabusPdf(selectedCourse)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Download Syllabus PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleEnrollClick(selectedCourse)}
                  className="rounded-lg bg-[#D4A843] px-4 py-2 text-xs font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
                >
                  Enroll Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
