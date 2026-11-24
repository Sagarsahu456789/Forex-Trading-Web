export type UserRole = 'ADMIN' | 'MENTOR' | 'STUDENT';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone?: string | null;
  emailVerified: boolean;
  mustChangePassword: boolean;
  studentCode?: string | null;
  mentorCode?: string | null;
}

export interface CourseItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  image_url: string;
  duration: string;
  fees: number;
  discounted_fees: number;
  syllabus: string[];
  outcomes: string[];
  status: 'ACTIVE' | 'INACTIVE';
  mentor_id: number | null;
  mentor_name?: string;
  mentor_specialization?: string;
  mentor_avatar?: string;
  pdf_material_url?: string;
}

export interface MentorItem {
  id: number;
  user_id?: number;
  mentor_code: string;
  full_name: string;
  email?: string;
  username?: string;
  phone?: string;
  specialization: string;
  experience_years: number;
  qualification: string;
  bio: string;
  avatar_url: string;
  is_active: number;
  assigned_courses_count?: number;
  live_classes_count?: number;
}

export interface AdmissionItem {
  id: number;
  admission_no: string;
  full_name: string;
  email: string;
  mobile: string;
  address?: string;
  date_of_birth?: string;
  course_id: number;
  course_title: string;
  admission_date: string;
  course_duration: string;
  total_fees: number;
  discount: number;
  final_fees: number;
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID';
  meeting_date?: string;
  meeting_time?: string;
  meeting_reason?: string;
  remarks?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  student_id_code?: string;
}

export interface PaymentItem {
  id: number;
  student_id: number;
  student_id_code?: string;
  student_name?: string;
  course_id: number;
  course_title: string;
  amount: number;
  discount_applied: number;
  payment_method: string;
  payment_mode: string;
  gateway_order_id: string;
  gateway_payment_id?: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REFUNDED';
  paid_at?: string;
  receipt_id?: number;
  receipt_number?: string;
}

export interface ReceiptItem {
  id: number;
  receipt_number: string;
  payment_id: number;
  student_id: number;
  student_code: string;
  student_name: string;
  course_name: string;
  payment_amount: number;
  remaining_balance: number;
  payment_method: string;
  reference_id: string;
  payment_status: string;
  issued_at: string;
}

export interface LiveClassItem {
  id: number;
  course_id: number;
  course_title: string;
  mentor_id: number;
  mentor_name?: string;
  title: string;
  description: string;
  class_date: string;
  start_time: string;
  duration_mins: number;
  meeting_platform: 'ZOOM' | 'GOOGLE_MEET';
  meeting_link?: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
}

export interface ClassRecordingItem {
  id: number;
  live_class_id: number;
  course_id: number;
  course_title: string;
  title: string;
  recording_url: string;
  duration_label: string;
  uploaded_at: string;
}

export interface StudyMaterialItem {
  id: number;
  course_id: number;
  course_title: string;
  mentor_name?: string;
  title: string;
  category: string;
  description: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface ExamItem {
  id: number;
  course_id: number;
  course_title: string;
  title: string;
  description: string;
  total_marks: number;
  passing_marks: number;
  duration_mins: number;
  scheduled_at: string;
  results_published: number;
  status: string;
  question_count: number;
  submission_id?: number;
  submission_status?: string;
  score?: number;
  percentage?: number;
  passed?: number;
  feedback?: string;
  submitted_at?: string;
}

export interface DoubtReplyItem {
  id: number;
  doubt_id: number;
  author_name: string;
  author_role: string;
  message: string;
  created_at: string;
}

export interface DoubtItem {
  id: number;
  student_id: number;
  student_name?: string;
  student_id_code?: string;
  course_id: number;
  course_title: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'ANSWERED' | 'RESOLVED';
  created_at: string;
  replies: DoubtReplyItem[];
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: string;
  target_role: string;
  course_title?: string;
  is_read?: number;
  created_at: string;
}

export interface BrokerItem {
  id: number;
  name: string;
  logo_text: string;
  description: string;
  educational_notes: string;
  official_url: string;
  partner_url: string;
  regulation_info: string;
  min_deposit: string;
  leverage_info: string;
}

export interface EventItem {
  id: number;
  title: string;
  description: string;
  event_date: string;
  location: string;
  category: string;
  status: string;
}

export interface GalleryItem {
  id: number;
  title: string;
  image_url: string;
  caption: string;
}

export interface OfferItem {
  id: number;
  title: string;
  description: string;
  badge_text: string;
  valid_until: string;
}
