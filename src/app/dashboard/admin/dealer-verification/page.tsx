"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Building2,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  FileImage,
  FileText,
  ZoomIn,
  IdCard,
  Receipt,
  FileCheck,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@/context/AuthContext";
import { getPendingKycList, reviewKyc } from "@/lib/adminApi";
import { Button } from "@/components/ui/Button";

// ─── KYC Field Definitions ────────────────────────────────────────────────────

// `ltdOnly` marks evidence that exists only for a limited company. A sole
// trader has no VAT registration and no Companies House record, so those rows
// are hidden when reviewing one — left visible they would read as four missing
// documents and get the applicant rejected for paperwork they cannot produce.
const KYC_FIELDS = [
  { id: "companyHouseName",           label: "Company House Registered Name",         category: "Corporate Details" },
  { id: "directorName",               label: "Lead Director Full Name",               category: "Corporate Details" },
  { id: "directorIdProof",            label: "Photo ID (Driving Licence / Passport)", category: "Corporate Details",       isProof: true },
  { id: "proofOfAddress",             label: "Proof of Address",                      category: "Corporate Details",       isProof: true, soleTraderOnly: true },
  { id: "representativeName",         label: "Representative Full Name",              category: "Corporate Details" },
  { id: "representativePosition",     label: "Representative Job Title",              category: "Corporate Details" },
  { id: "personOfSignificantControl", label: "Person of Significant Control (PSC)",  category: "Corporate Details",       ltdOnly: true },
  { id: "vatNumber",                  label: "VAT Registration Number",               category: "Commercial & Contact",    ltdOnly: true },
  { id: "vatProof",                   label: "VAT Certificate / Registration Proof",  category: "Commercial & Contact",    isProof: true, ltdOnly: true },
  { id: "companyRegistrationNumber",  label: "Company House Registration Number",     category: "Commercial & Contact",    ltdOnly: true },
  { id: "companyRegistrationProof",   label: "Company House Certificate",             category: "Commercial & Contact",    isProof: true, ltdOnly: true },
  { id: "businessWebsite",            label: "Corporate Website URL",                 category: "Commercial & Contact",    isLink: true },
  { id: "googleReviewsLink",          label: "Google Reviews Link",                   category: "Commercial & Contact",    isLink: true },
  { id: "businessRegisteredAddress",  label: "Registered Business Address",           category: "Addresses",               isTextarea: true },
  { id: "tradingAddress",             label: "Trading Address",                       category: "Addresses",               isTextarea: true },
  { id: "paymentReference",           label: "Unique Bank Payment Reference Code",   category: "Payment Verification" },
  { id: "paymentScreenshot",          label: "Bank Transfer Receipt / Screenshot",   category: "Payment Verification",    isProof: true },
];

/**
 * The fields that apply to one applicant. Records predating the business-type
 * toggle have no `businessType` and are all limited companies, so an absent
 * value must read as PRIVATE_LIMITED rather than as a sole trader — otherwise
 * every historic record would silently lose its VAT and Companies House rows.
 */
function fieldsFor(kyc: any) {
  const soleTrader = kyc?.businessType === "SOLE_PROPRIETORSHIP";
  return KYC_FIELDS.filter((f: any) =>
    soleTrader ? !f.ltdOnly : !f.soleTraderOnly,
  );
}

// ─── Lightbox Component ───────────────────────────────────────────────────────

function DocumentLightbox({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  const isPdf = url.toLowerCase().includes(".pdf");
  const isImage = !isPdf;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4"
      onClick={onClose}
    >
      {/* Neon blurs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-[120px] pointer-events-none" />

      <div
        className="relative max-w-4xl w-full flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="w-full flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            {isPdf ? (
              <FileText size={16} className="text-primary" />
            ) : (
              <FileImage size={16} className="text-primary" />
            )}
            <span className="text-xs font-extrabold uppercase tracking-widest text-gray-300">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] transition-colors"
            >
              <ExternalLink size={12} />
              Open in Tab
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-red-500/20 border border-[var(--border-default)] hover:border-red-500/30 text-[var(--text-muted)] hover:text-red-400 transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Document viewer */}
        <div className="w-full rounded-2xl border border-[var(--border-default)] overflow-hidden bg-[var(--bg-card)] shadow-2xl shadow-black/60 max-h-[75vh]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={label}
              className="w-full max-h-[75vh] object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={label}
              className="w-full h-[70vh]"
              style={{ border: "none" }}
            />
          )}
        </div>

        <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-widest">
          Press ESC or click outside to close
        </p>
      </div>
    </div>
  );
}

// ─── Proof Document Thumbnail ─────────────────────────────────────────────────

function ProofThumbnail({
  url,
  label,
  onView,
}: {
  url: string;
  label: string;
  onView: (url: string, label: string) => void;
}) {
  const isPdf = url.toLowerCase().includes(".pdf");
  const isImage = !isPdf;

  return (
    <button
      type="button"
      onClick={() => onView(url, label)}
      className="group relative flex items-center gap-2.5 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-left w-full"
    >
      {isImage ? (
        <div className="relative shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-[var(--border-default)] bg-[var(--bg-dropdown)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn size={12} className="" />
          </div>
        </div>
      ) : (
        <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-dropdown)] border border-[var(--border-default)] flex items-center justify-center">
          <FileText size={16} className="text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-primary uppercase tracking-widest flex items-center gap-1">
          <ZoomIn size={9} />
          Click to Review
        </p>
        <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">{url.split("/").pop()}</p>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDealerVerificationPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [pendingList, setPendingList] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, { status: "APPROVED" | "REJECTED"; note: string }>>({});

  // Lightbox state
  const [lightbox, setLightbox] = React.useState<{ url: string; label: string } | null>(null);

  // Auth guard
  React.useEffect(() => {
    if (!authLoading) {
      if (!user) { router.replace("/auth/login"); return; }
      if (profile?.role !== "ADMIN") { router.replace("/dashboard"); return; }
    }
  }, [user, profile, authLoading, router]);

  const loadPendingKyc = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const list = await getPendingKycList();
      setPendingList(list || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load pending dealer registrations.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (profile?.role === "ADMIN") loadPendingKyc();
  }, [profile]);

  const toggleExpand = (dealerKyc: any) => {
    if (expandedId === dealerKyc.id) {
      setExpandedId(null);
      setDecisions({});
    } else {
      setExpandedId(dealerKyc.id);
      const initialDecisions: Record<string, any> = {};
      const existingStatuses = dealerKyc.documentStatuses || {};
      fieldsFor(dealerKyc).forEach((field) => {
        const item = existingStatuses[field.id];

        // Auto-approve payment fields for Stripe-verified records
        const isPaymentFieldStripeVerified =
          dealerKyc.stripePaymentIntentId &&
          (field.id === 'paymentReference' || field.id === 'paymentScreenshot');

        if (isPaymentFieldStripeVerified) {
          initialDecisions[field.id] = { status: "APPROVED", note: "Stripe verified" };
        } else {
          initialDecisions[field.id] = {
            // Only preserve REJECTED from a previous review; default everything else
            // (including PENDING first-submissions) to APPROVED so the admin only
            // needs to actively reject fields rather than approve each one manually.
            status: item?.status === "REJECTED" ? "REJECTED" : "APPROVED",
            note: item?.status === "REJECTED" ? (item?.note || "") : "",
          };
        }
      });
      setDecisions(initialDecisions);
    }
  };

  const handleDecisionChange = (fieldName: string, status: "APPROVED" | "REJECTED") => {
    setDecisions((prev) => ({ ...prev, [fieldName]: { ...prev[fieldName], status } }));
  };

  const handleNoteChange = (fieldName: string, note: string) => {
    setDecisions((prev) => ({ ...prev, [fieldName]: { ...prev[fieldName], note } }));
  };

  const submitReview = async (dealerKycId: string) => {
    setSubmittingId(dealerKycId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const fieldsPayload = Object.keys(decisions).map((fieldName) => ({
        field: fieldName,
        status: decisions[fieldName].status,
        note: decisions[fieldName].status === "REJECTED" ? decisions[fieldName].note : "",
      }));

      const missingNotes = fieldsPayload.filter((f) => f.status === "REJECTED" && !f.note.trim());
      if (missingNotes.length > 0) {
        throw new Error("Please provide a rejection reason note for all rejected fields.");
      }

      await reviewKyc(dealerKycId, fieldsPayload);
      setSuccessMsg("KYC review submitted successfully! Notification emails have been triggered.");
      setExpandedId(null);
      setDecisions({});
      await loadPendingKyc();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit KYC review decision.");
    } finally {
      setSubmittingId(null);
    }
  };

  if (authLoading || (user && !profile) || (loading && pendingList.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || profile?.role !== "ADMIN") return null;

  const userName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName || ""}`
    : user?.email?.split("@")[0] || "Admin";

  return (
    <>
      {/* Document Lightbox */}
      {lightbox && (
        <DocumentLightbox
          url={lightbox.url}
          label={lightbox.label}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="min-h-screen pt-20 pb-12">
        <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
          <DashboardSidebar role="admin" userName={userName} userType="Super Admin" />

          <main className="flex-1 space-y-8 min-w-0">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-input)] p-6 rounded-2xl border border-[var(--border-default)] backdrop-blur-md">
              <div>
                <h1 className="text-3xl font-black font-heading uppercase tracking-tight flex items-center gap-3">
                  <ShieldCheck className="text-primary hidden sm:block" size={28} />
                  Dealer KYC Reviews
                </h1>
                <p className="text-[var(--text-muted)] mt-1">Granular field verification portal for dealership requests</p>
              </div>
              <Button
                onClick={loadPendingKyc}
                disabled={loading}
                className="flex items-center gap-2 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border-[var(--border-default)]"
                variant="outline"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            {/* Toast Banners */}
            {errorMsg && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-start gap-2.5">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* KYC List */}
            {pendingList.length === 0 ? (
              <div className="dealer-glass-card p-12 text-center border border-[var(--border-default)] flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                  <Check size={28} />
                </div>
                <h3 className="text-lg font-extrabold uppercase font-heading">All Caught Up!</h3>
                <p className="text-[var(--text-muted)] text-xs mt-2 max-w-sm">
                  No dealer registrations require document verification at this moment.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs uppercase font-extrabold text-[var(--text-muted)] tracking-wider flex items-center gap-2">
                    <Clock size={14} className="text-primary animate-pulse" />
                    Awaiting Superadmin Review ({pendingList.length})
                  </span>
                </div>

                {pendingList.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const companyName = item.dealerProfile?.companyName || "Unknown Dealership";
                  const ownerEmail = item.dealerProfile?.user?.email || "No email";
                  const isSubmitting = submittingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`dealer-glass-card border transition-all duration-300 overflow-hidden ${
                        isExpanded ? "border-primary/40 shadow-[0_0_25px_rgba(237,28,36,0.15)]" : "border-[var(--border-default)]"
                      }`}
                    >
                      {/* Collapsed Header */}
                      <div
                        onClick={() => toggleExpand(item)}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-xl bg-[var(--bg-dropdown)] border border-[var(--border-default)] text-primary shrink-0">
                            <Building2 size={24} />
                          </div>
                          <div>
                            <h3 className="text-base font-black font-heading tracking-tight uppercase">
                              {companyName}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[var(--text-muted)] font-semibold">
                              <span>Owner: {item.representativeName}</span>
                              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                              <span>Email: {ownerEmail}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-auto justify-end border-t sm:border-t-0 border-[var(--border-default)] pt-3 sm:pt-0">
                          {item.status === "REJECTED" ? (
                            <span className="px-2.5 py-1 rounded-md text-xs font-extrabold uppercase tracking-wider border bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              Rejected — Awaiting Fix
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md text-xs font-extrabold uppercase tracking-wider border bg-amber-500/10 border-amber-500/20 text-amber-500 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                              Pending Review
                            </span>
                          )}
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>

                      {/* Expanded Review Panel */}
                      {isExpanded && (
                        <div className="border-t border-[var(--border-default)] bg-[var(--bg-input)] p-4 md:p-8 space-y-6 md:space-y-8 animate-fadeIn">
                          {/* Summary Meta */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-xs">
                            <div>
                              <p className="text-[var(--text-muted)] uppercase font-extrabold text-xs tracking-wider">Representative Role</p>
                              <p className="font-bold mt-0.5">{item.representativePosition}</p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)] uppercase font-extrabold text-xs tracking-wider">Submitted On</p>
                              <p className="font-bold mt-0.5">
                                {new Date(item.submittedAt).toLocaleDateString("en-GB", {
                                  day: "numeric", month: "short", year: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)] uppercase font-extrabold text-xs tracking-wider">Record ID</p>
                              <p className="font-bold text-[var(--text-muted)] truncate mt-0.5">{item.id}</p>
                            </div>
                          </div>

                          {/* Field Groups */}
                          {renderFieldsGrouped(item)}

                          {/* Submit Block */}
                          <div className="pt-6 border-t border-[var(--border-default)] flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-start gap-2.5 text-xs text-[var(--text-muted)]">
                              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                              <p className="max-w-md">
                                Approving all fields will immediately set overall status to{" "}
                                <strong className="text-emerald-400">APPROVED</strong> and unlock this dealer&apos;s
                                dashboard. Rejecting any fields will require them to correct those specific items.
                              </p>
                            </div>
                            <button
                              onClick={() => submitReview(item.id)}
                              disabled={isSubmitting}
                              className="w-full sm:w-auto px-8 py-3 rounded-lg bg-primary hover:bg-primary/95 disabled:bg-[var(--bg-input)] disabled:text-[var(--text-muted)] text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-neon flex items-center justify-center gap-2"
                            >
                              {isSubmitting ? (
                                <><Loader2 className="animate-spin" size={14} /> Submitting Decision...</>
                              ) : (
                                <><UserCheck size={14} /> Submit KYC Decision</>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );

  // ─── Field Group Renderer ─────────────────────────────────────────────────────
  function renderFieldsGrouped(item: any) {
    const categories = ["Corporate Details", "Commercial & Contact", "Addresses", "Payment Verification"];

    const categoryIcons: Record<string, React.ReactNode> = {
      "Corporate Details": <Building2 size={12} className="text-primary" />,
      "Commercial & Contact": <FileCheck size={12} className="text-primary" />,
      "Addresses": <IdCard size={12} className="text-primary" />,
      "Payment Verification": <Receipt size={12} className="text-primary" />,
    };

    const soleTrader = item?.businessType === "SOLE_PROPRIETORSHIP";

    return (
      <div className="space-y-6 text-left">
        {/* Says which ruleset is in force, so a reviewer never reads a hidden
            VAT row as a missing one. */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Business type
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${soleTrader
              ? "bg-amber-500/10 border-amber-500/25 text-amber-500"
              : "bg-sky-500/10 border-sky-500/25 text-sky-500"}`}
          >
            {soleTrader ? "Sole Proprietorship" : "Private Limited"}
          </span>
          {soleTrader && (
            <span className="text-[11px] text-[var(--text-muted)]">
              No VAT or Companies House record — verified by ID and address.
            </span>
          )}
        </div>

        {categories.map((cat) => {
          const catFields = fieldsFor(item).filter((f) => f.category === cat);

          // Stripe-verified records: show auto-approved badge for Payment Verification, skip manual fields
          if (cat === 'Payment Verification' && item.stripePaymentIntentId) {
            return (
              <div key={cat} className="space-y-3">
                <h4 className="text-xs font-black uppercase text-primary tracking-widest border-l-2 border-primary pl-2.5 flex items-center gap-2">
                  <Receipt size={12} className="text-primary" />
                  Payment Verification
                </h4>
                <div className="p-3 sm:p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-widest">
                        Stripe Verified · Auto-Approved
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                        {item.stripePaymentIntentId}
                      </p>
                      {item.stripeChargedAt && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Charged {new Date(item.stripeChargedAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Legacy records fall through to normal catFields.map rendering
          return (
            <div key={cat} className="space-y-3">
              <h4 className="text-xs font-black uppercase text-primary tracking-widest border-l-2 border-primary pl-2.5 flex items-center gap-2">
                {categoryIcons[cat]}
                {cat}
              </h4>
              <div className="grid grid-cols-1 gap-3">
                {catFields.map((field) => {
                  const val = item[field.id];
                  const decision = decisions[field.id] || { status: "APPROVED", note: "" };
                  const isApproved = decision.status === "APPROVED";
                  const isRejected = decision.status === "REJECTED";
                  const hasValue = val && val !== "";

                  return (
                    <div
                      key={field.id}
                      className={`p-3 sm:p-4 rounded-xl border transition-all duration-300 ${
                        isApproved ? "bg-[var(--bg-input)] border-[var(--border-default)]" : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      {/* Top row: label + field value left, approve/reject buttons right */}
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: Content */}
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <p className="text-xs text-[var(--text-muted)] font-extrabold uppercase tracking-wider">
                            {field.label}
                          </p>

                          {field.isProof ? (
                            hasValue ? (
                              <ProofThumbnail
                                url={val}
                                label={field.label}
                                onView={(url, label) => setLightbox({ url, label })}
                              />
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-input)]">
                                <FileImage size={14} className="text-[var(--text-muted)]" />
                                <span className="text-[11px] text-[var(--text-muted)] font-semibold italic">
                                  No document uploaded
                                </span>
                              </div>
                            )
                          ) : field.isLink && hasValue ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary font-bold hover:underline flex items-center gap-1 inline-flex break-all"
                            >
                              <span className="truncate max-w-[200px] sm:max-w-none">{val}</span>
                              <ExternalLink size={11} className="shrink-0" />
                            </a>
                          ) : field.isTextarea ? (
                            <p className="text-xs font-semibold text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                              {val || "—"}
                            </p>
                          ) : (
                            <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                              {hasValue ? val : <span className="text-[var(--text-muted)] italic">Not provided</span>}
                            </p>
                          )}
                        </div>

                        {/* Right: Approve / Reject Buttons (always inline) */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDecisionChange(field.id, "APPROVED")}
                            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1 cursor-pointer ${
                              isApproved
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                                : "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            <Check size={11} />
                            <span className="hidden sm:inline">Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecisionChange(field.id, "REJECTED")}
                            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1 cursor-pointer ${
                              isRejected
                                ? "bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                                : "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            <X size={11} />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                        </div>
                      </div>

                      {/* Rejection note — full width below, only when rejected */}
                      {isRejected && (
                        <div className="relative mt-2.5">
                          <div className="absolute top-2.5 left-2.5 text-red-500 pointer-events-none">
                            <MessageSquare size={12} />
                          </div>
                          <input
                            type="text"
                            value={decision.note}
                            onChange={(e) => handleNoteChange(field.id, e.target.value)}
                            placeholder="Reason for rejection..."
                            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-input)] border border-red-500/40 focus:border-red-500 rounded-lg text-[11px] font-semibold text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-red-500 transition-all"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
