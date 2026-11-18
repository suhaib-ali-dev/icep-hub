import jsPDF from "jspdf";
import { Agreement } from "@/types";

// Official 3-Paragraph ICEP Mandate
const OFFICIAL_ICEP_MANDATE = `The International Commission for Equity and Peace (ICEP) is an interdisciplinary coalition of researchers, practitioners, advocates, policymakers, survivors of political, gender-based, domestic, and intimate partner violence (hereafter referred to as “survivors”), activists, healers, artists, scholars, and community-based leaders committed to advancing global equity, peace, and social justice through collaborative research efforts, international and regional policy engagement, capacity strengthening, community-driven action, grassroots mobilization, and transnational movement-building.

The strength of ICEP depends upon the professionalism, integrity, and collaborative spirit of its members. This document establishes shared expectations regarding participation, leadership, conduct, and representation to ensure that all members contribute to a respectful, accountable, and mission-driven community.

Membership in ICEP is voluntary and reflects a commitment to uphold these standards while participating in organizational activities and when representing the organization publicly.`;

async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

export async function downloadOfficialAgreementPdf(
  agreement: Agreement,
  termsText: string,
  liveWorkingGroupName?: string,
  letterheadUrl: string = "/icep-letterhead.png" // Place your letterhead in public folder
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = 40;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 55) {
      doc.addPage();
      y = 40;
    }
  };

  // --- 1. OFFICIAL IMAGE LETTERHEAD HEADER ---
  const letterheadBase64 = await getBase64ImageFromUrl(letterheadUrl);
  if (letterheadBase64) {
    try {
      // Renders official letterhead photo across the top (width: 595pt A4 width, height: 75pt)
      doc.addImage(letterheadBase64, "JPEG", 0, 0, pageWidth, 75);
      y = 90;
    } catch (e) {
      y = 40;
    }
  } else {
    // Brand header fallback if image not found in public folder
    doc.setFillColor(0, 74, 173); // #004aad
    doc.rect(0, 0, pageWidth, 60, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("INTERNATIONAL COMMISSION FOR EQUITY AND PEACE (ICEP)", margin, 35);
    y = 75;
  }

  // --- 2. MEMBER & ORGANIZATIONAL METADATA BOX ---
  const resolvedWg = 
    liveWorkingGroupName || 
    agreement.memberSnapshot?.workingGroupName || 
    "Assigned Working Group";

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, maxWidth, 75, 6, 6, "FD");

  doc.setTextColor(0, 74, 173);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("Member Name:", margin + 12, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(agreement.memberSnapshot?.fullName || "N/A", margin + 95, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 74, 173);
  doc.text("Email:", margin + 270, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(agreement.memberSnapshot?.email || "N/A", margin + 310, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 74, 173);
  doc.text("Working Group:", margin + 12, y + 40);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(resolvedWg, margin + 95, y + 40);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 74, 173);
  doc.text("Sub-Team:", margin + 270, y + 40);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(agreement.memberSnapshot?.subTeamName || "None", margin + 325, y + 40);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 74, 173);
  doc.text("Commitment:", margin + 12, y + 60);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${agreement.availability?.hoursPerWeek || 4} hrs/week (${
      agreement.availability?.preferredHours || "Flexible"
    })`,
    margin + 95,
    y + 60
  );

  y += 95;

  // --- 3. SECTION 1: INTRODUCTION & MANDATE ---
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 74, 173);
  doc.text("1. INTRODUCTION & COALITION MANDATE", margin, y);
  y += 15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const introLines = doc.splitTextToSize(OFFICIAL_ICEP_MANDATE, maxWidth);
  introLines.forEach((line: string) => {
    checkPageBreak(14);
    doc.text(line, margin, y);
    y += 13;
  });
  y += 10;

  // --- 4. SECTION 2: ORGANIZATIONAL & WORKING GROUP RESPONSIBILITIES ---
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 74, 173);
  doc.text("2. ORGANIZATIONAL & WORKING GROUP RESPONSIBILITIES", margin, y);
  y += 16;

  // A. General Organizational Commitments
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("A. General ICEP Organizational Commitments", margin, y);
  y += 14;

  const generalResp = agreement.responsibilitiesSnapshot?.general?.length ? agreement.responsibilitiesSnapshot.general : [
    "Participate regularly in meetings and Working Group (WG) activities.",
    "Complete agreed-upon tasks within established professional timelines.",
    "Maintain strict confidentiality regarding internal organizational documents."
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  generalResp.forEach((item) => {
    const bulletLines = doc.splitTextToSize(`•  ${item}`, maxWidth - 10);
    bulletLines.forEach((line: string) => {
      checkPageBreak(14);
      doc.text(line, margin + 6, y);
      y += 13;
    });
  });
  y += 10;

  // B. Working Group Specific Responsibilities
  checkPageBreak(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`B. Working Group Responsibilities (${resolvedWg})`, margin, y);
  y += 14;

  const wgResp = agreement.responsibilitiesSnapshot?.workingGroup?.length ? agreement.responsibilitiesSnapshot.workingGroup : [
    "Contribute domain expertise and active collaboration toward working group deliverables."
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  wgResp.forEach((item) => {
    const bulletLines = doc.splitTextToSize(`•  ${item}`, maxWidth - 10);
    bulletLines.forEach((line: string) => {
      checkPageBreak(14);
      doc.text(line, margin + 6, y);
      y += 13;
    });
  });
  y += 12;

  // --- 5. SECTION 3: BINDING TERMS & CONDITIONS ---
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 74, 173);
  doc.text("3. BINDING TERMS & CONDITIONS", margin, y);
  y += 15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const termLines = doc.splitTextToSize(termsText, maxWidth);
  termLines.forEach((line: string) => {
    checkPageBreak(13);
    doc.text(line, margin, y);
    y += 12;
  });
  y += 18;

  // --- 6. SECTION 4: ELECTRONIC EXECUTION & SIGNATURE ---
  checkPageBreak(100);
  doc.setDrawColor(0, 74, 173);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 74, 173);
  doc.text("4. ELECTRONIC EXECUTION & VERIFICATION", margin, y);
  y += 16;

  doc.setFont("times", "bolditalic");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(
    agreement.signature?.typedLegalName || "Pending Electronic Signature",
    margin,
    y
  );
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Verified Electronic Legal Signature  •  Generated on ${new Date().toLocaleDateString()}`,
    margin,
    y
  );

  if (agreement.signature?.drawnSignatureDataUrl) {
    try {
      doc.addImage(
        agreement.signature.drawnSignatureDataUrl,
        "PNG",
        pageWidth - margin - 130,
        y - 34,
        120,
        42
      );
    } catch {
      // Ignore if image format fails
    }
  }

  const safeName = (agreement.memberSnapshot?.fullName || "Member").replace(
    /\s+/g,
    "_"
  );
  doc.save(`ICEP_Agreement_${safeName}.pdf`);
}