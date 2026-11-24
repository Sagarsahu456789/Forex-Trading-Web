import { jsPDF } from 'jspdf';
import type { CourseItem, ReceiptItem } from '../types/academy';

export function downloadReceiptPdf(receipt: ReceiptItem): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Deep Navy Header Band
  doc.setFillColor(8, 16, 30);
  doc.rect(0, 0, 595, 118, 'F');

  // Gold Accent Emblem Bar
  doc.setFillColor(212, 168, 67);
  doc.rect(42, 34, 6, 48, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('AURELIA FX ACADEMY', 60, 54);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(212, 168, 67);
  doc.text('Institutional Currency Education · Official Tuition Payment Receipt', 60, 74);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(10);
  doc.text(`Receipt No: ${receipt.receipt_number}`, 405, 52);
  doc.text(`Issued: ${new Date(receipt.issued_at).toLocaleDateString()}`, 405, 68);

  // Body Metadata
  let y = 160;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Student & Tuition Summary', 42, y);
  y += 14;
  doc.setDrawColor(226, 232, 240);
  doc.line(42, y, 553, y);
  y += 26;

  const rows: Array<[string, string]> = [
    ['Student ID', receipt.student_code],
    ['Student Name', receipt.student_name],
    ['Enrolled Course', receipt.course_name],
    ['Payment Amount', `$${Number(receipt.payment_amount).toFixed(2)} USD`],
    ['Remaining Balance', `$${Number(receipt.remaining_balance).toFixed(2)} USD`],
    ['Payment Method', receipt.payment_method],
    ['Gateway Reference ID', receipt.reference_id],
    ['Payment Date', new Date(receipt.issued_at).toLocaleString()],
    ['Verification Status', `${receipt.payment_status} (Server Signature Verified)`],
  ];

  doc.setFontSize(11);
  rows.forEach(([label, value], index) => {
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(42, y - 14, 511, 24, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(label, 52, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value, 240, y);
    y += 28;
  });

  y += 24;
  doc.setDrawColor(212, 168, 67);
  doc.rect(42, y, 511, 68);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Official Verification Notice', 56, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    'This receipt is system-generated upon cryptographic gateway signature verification on Aurelia FX Academy servers.',
    56,
    y + 42
  );

  doc.save(`${receipt.receipt_number}.pdf`);
}

export function downloadCourseSyllabusPdf(course: CourseItem): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(8, 16, 30);
  doc.rect(0, 0, 595, 104, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(course.title, 42, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(212, 168, 67);
  doc.text(`Aurelia FX Academy · Duration: ${course.duration} · Tuition: $${course.discounted_fees}`, 42, 70);

  let y = 140;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Program Overview', 42, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const descLines = doc.splitTextToSize(course.description, 510);
  doc.text(descLines, 42, y);
  y += descLines.length * 15 + 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Curriculum Modules', 42, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  course.syllabus.forEach((mod) => {
    doc.text(`• ${mod}`, 48, y);
    y += 18;
  });

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Learning Outcomes', 42, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  course.outcomes.forEach((out) => {
    doc.text(`• ${out}`, 48, y);
    y += 18;
  });

  doc.save(`${course.slug}-syllabus.pdf`);
}

export function downloadAttendanceReportPdf(
  title: string,
  records: Array<{ attendance_date: string; student_name?: string; student_id_code?: string; course_title: string; status: string; remarks?: string }>
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(8, 16, 30);
  doc.rect(0, 0, 595, 76, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Aurelia FX Academy — ${title}`, 40, 44);

  let y = 108;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', 40, y);
  doc.text('Student', 115, y);
  doc.text('Course', 255, y);
  doc.text('Status', 465, y);
  y += 10;
  doc.line(40, y, 555, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  records.slice(0, 35).forEach((r) => {
    doc.text(r.attendance_date, 40, y);
    doc.text((r.student_name || r.student_id_code || 'Student').slice(0, 22), 115, y);
    doc.text(r.course_title.slice(0, 34), 255, y);
    doc.text(r.status, 465, y);
    y += 18;
  });

  doc.save('aurelia_attendance_report.pdf');
}
