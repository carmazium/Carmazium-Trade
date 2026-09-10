"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Building2,
  User,
  Globe,
  MapPin,
  CreditCard,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle,
  CheckCircle2,
  Lock,
  AlertCircle,
  LogOut,
  Loader2,
  FileSpreadsheet,
  Upload,
  FileImage,
  X,
  Eye,
  IdCard,
  Receipt,
  FileCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getDealerKyc, submitDealerKyc, DealerKycData, BusinessType, createKycCheckoutSession } from "@/lib/dealerApi";
import { uploadImage } from "@/lib/supabase";
import { apiClient } from "@/lib/apiClient";
import { useRouter } from "next/navigation";

export const KYC_SKIP_KEY = 'kyc_skipped_v1';

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string; hint: string }[] = [
  {
    value: "PRIVATE_LIMITED",
    label: "Private Limited",
    hint: "Registered at Companies House (Ltd)",
  },
  {
    value: "SOLE_PROPRIETORSHIP",
    label: "Sole Proprietorship",
    hint: "Trading as an individual, no Ltd company",
  },
];

// ─── File Upload Component ─────────────────────────────────────────────────────

interface FileUploadFieldProps {
  label: string;
  hint: string;
  fieldName: string;
  value: string;
  onUpload: (fieldName: string, url: string) => void;
  onClear: (fieldName: string) => void;
  isApproved: boolean;
  rejectionNote: string | null;
  isSubmitting: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

function FileUploadField({
  label,
  hint,
  fieldName,
  value,
  onUpload,
  onClear,
  isApproved,
  rejectionNote,
  isSubmitting,
  icon: Icon,
}: FileUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (isApproved || isSubmitting) return;
    setUploadError("");

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError("File too large. Max size is 10MB.");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only JPG, PNG, WEBP, or PDF files are accepted.");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadImage(file, "listings", "kyc");
      onUpload(fieldName, url);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const isImage = value && (value.includes(".jpg") || value.includes(".jpeg") || value.includes(".png") || value.includes(".webp"));

  const borderClass = isApproved
    ? "border-emerald-500/30 bg-emerald-500/5"
    : rejectionNote
    ? "border-red-500/30 bg-red-500/5"
    : dragging
    ? "border-primary/60 bg-primary/5"
    : "border-[var(--border-default)] bg-[var(--bg-input)]";

  return (
    <div className="space-y-1.5 text-left">
      <label className="text-xs font-extrabold uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Icon size={11} className={isApproved ? "text-emerald-500" : rejectionNote ? "text-red-400" : "text-[var(--text-muted)]"} />
          {label}
        </span>
        {isApproved && (
          <span className="flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            <Lock size={8} /> LOCKED &amp; VERIFIED
          </span>
        )}
      </label>

      {value && !uploading ? (
        /* ── Preview Block ── */
        <div className={`rounded-xl border p-3 transition-all ${borderClass}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isApproved ? "bg-emerald-500/10" : "bg-[var(--bg-input)]"}`}>
              {isImage ? (
                <FileImage size={18} className={isApproved ? "text-emerald-400" : "text-primary"} />
              ) : (
                <FileCheck size={18} className={isApproved ? "text-emerald-400" : "text-primary"} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                {isApproved ? "✓ Document Verified" : "Document Uploaded"}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate">{value.split("/").pop()}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"
                title="Preview"
              >
                <Eye size={13} />
              </a>
              {!isApproved && !isSubmitting && (
                <button
                  type="button"
                  onClick={() => onClear(fieldName)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                  title="Remove"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          {isImage && (
            <div className="mt-2.5 rounded-lg overflow-hidden border border-[var(--border-default)] max-h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Document preview" className="w-full h-24 object-cover opacity-80" />
            </div>
          )}
        </div>
      ) : (
        /* ── Upload Drop Zone ── */
        <div
          className={`rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer ${borderClass} ${
            isApproved || isSubmitting ? "opacity-50 pointer-events-none" : "hover:border-primary/40 hover:bg-primary/5"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isApproved && !isSubmitting && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleInputChange}
            disabled={isApproved || isSubmitting}
          />

          <div className="flex flex-col items-center justify-center py-5 px-4 gap-2">
            {uploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-primary" />
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Uploading securely...</p>
              </>
            ) : (
              <>
                <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]">
                  <Upload size={16} className="text-[var(--text-muted)]" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[var(--text-secondary)]">
                    {dragging ? "Drop file here" : "Click or drag to upload"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-500 font-semibold flex items-start gap-1">
          <AlertCircle size={10} className="shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </p>
      )}

      {rejectionNote && (
        <p className="text-xs text-red-400 font-semibold leading-relaxed flex items-start gap-1">
          <AlertCircle size={10} className="shrink-0 mt-0.5" />
          <span>{rejectionNote}</span>
        </p>
      )}
    </div>
  );
}

// ─── Main KYC Overlay Component ────────────────────────────────────────────────

export function KycOverlayForm({ onSkip }: { onSkip?: () => void }) {
  const { profile, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [kycData, setKycData] = useState<DealerKycData | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── £1 Verification Fee State (paid via hosted Stripe Checkout redirect) ──
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // ── Text Form Fields ──
  const [formData, setFormData] = useState({
    businessType: "PRIVATE_LIMITED" as BusinessType,
    companyHouseName: "",
    representativeName: "",
    representativePosition: "",
    directorName: "",
    personOfSignificantControl: "",
    vatNumber: "",
    companyRegistrationNumber: "",
    businessWebsite: "",
    businessRegisteredAddress: "",
    tradingAddress: "",
    googleReviewsLink: "",
  });

  // ── File Upload URL Fields ──
  const [fileUrls, setFileUrls] = useState({
    directorIdProof: "",
    proofOfAddress: "",
    vatProof: "",
    companyRegistrationProof: "",
  });

  // ── Load existing KYC record on mount ──
  useEffect(() => {
    async function loadKyc() {
      try {
        const kyc = await getDealerKyc();
        setKycData(kyc);
        if (kyc) {
          setFormData({
            // Records created before the toggle existed have no businessType —
            // they are all limited companies, so that is the right fallback.
            businessType: kyc.businessType || "PRIVATE_LIMITED",
            companyHouseName: kyc.companyHouseName || "",
            representativeName: kyc.representativeName || "",
            representativePosition: kyc.representativePosition || "",
            directorName: kyc.directorName || "",
            personOfSignificantControl: kyc.personOfSignificantControl || "",
            vatNumber: kyc.vatNumber || "",
            companyRegistrationNumber: kyc.companyRegistrationNumber || "",
            businessWebsite: kyc.businessWebsite || "",
            businessRegisteredAddress: kyc.businessRegisteredAddress || "",
            tradingAddress: kyc.tradingAddress || "",
            googleReviewsLink: kyc.googleReviewsLink || "",
          });
          setFileUrls({
            directorIdProof: kyc.directorIdProof || "",
            proofOfAddress: kyc.proofOfAddress || "",
            vatProof: kyc.vatProof || "",
            companyRegistrationProof: kyc.companyRegistrationProof || "",
          });
          // Populate already-paid state if the dealer has previously cleared the £1 fee
          if (kyc.stripeChargedAt) {
            setAlreadyPaid(true);
            setPaidAt(kyc.stripeChargedAt);
          } else if (kyc.status === "PENDING") {
            // Fields were saved on a previous visit but the dealer never completed (or
            // cancelled) the Stripe Checkout redirect — skip straight to the payment step
            // instead of making them re-click through steps 1 and 2.
            setActiveStep(3);
          }
        }
      } catch (err: any) {
        console.error("Failed to load dealer KYC info:", err);
      } finally {
        setLoading(false);
      }
    }
    loadKyc();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = (fieldName: string, url: string) => {
    setFileUrls((prev) => ({ ...prev, [fieldName]: url }));
  };

  const handleFileClear = (fieldName: string) => {
    setFileUrls((prev) => ({ ...prev, [fieldName]: "" }));
  };

  const isFieldApproved = (fieldName: string): boolean => {
    if (!kycData?.documentStatuses) return false;
    return kycData.documentStatuses[fieldName]?.status === "APPROVED";
  };

  const getFieldRejectionNote = (fieldName: string): string | null => {
    if (!kycData?.documentStatuses) return null;
    const item = kycData.documentStatuses[fieldName];
    return item?.status === "REJECTED" ? item.note : null;
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // Option A — skip KYC for now; show locked dealer dashboard
  const handleSkip = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(KYC_SKIP_KEY, '1');
    }
    onSkip?.();
  };

  // Option B — switch role to BUYER immediately
  const handleSwitchToBuyer = async () => {
    setSwitchingRole(true);
    try {
      await apiClient('/users/elevate', {
        method: 'POST',
        body: JSON.stringify({ newRole: 'BUYER' }),
      });
      await refreshProfile();
      if (typeof window !== 'undefined') {
        localStorage.removeItem(KYC_SKIP_KEY);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch role. Please try again.');
    } finally {
      setSwitchingRole(false);
    }
  };

  // A sole trader is not registered at Companies House and is usually below the
  // VAT threshold, so the limited-company evidence simply does not exist for
  // them. Asking for it anyway is what was blocking them from verifying at all.
  const isSoleTrader = formData.businessType === "SOLE_PROPRIETORSHIP";

  const validateStep = (step: number): boolean => {
    setErrorMsg("");
    if (step === 1) {
      if (!formData.companyHouseName.trim()) { setErrorMsg(isSoleTrader ? "Trading Name is required." : "Company Name is required."); return false; }
      if (!formData.representativeName.trim()) { setErrorMsg("Representative Name is required."); return false; }
      if (!formData.representativePosition.trim()) { setErrorMsg("Representative Position is required."); return false; }
      if (!formData.directorName.trim()) { setErrorMsg(isSoleTrader ? "Owner Full Name is required." : "Director Name is required."); return false; }
      if (!isSoleTrader && !formData.personOfSignificantControl.trim()) { setErrorMsg("Person of Significant Control (PSC) is required."); return false; }
    } else if (step === 2) {
      if (isSoleTrader) {
        // Identity and address stand in for the company register.
        if (!fileUrls.directorIdProof) { setErrorMsg("Please upload your driving licence or passport."); return false; }
        if (!fileUrls.proofOfAddress) { setErrorMsg("Please upload a proof of address."); return false; }
      } else {
        if (!formData.vatNumber.trim()) { setErrorMsg("VAT Number is required."); return false; }
        if (!formData.companyRegistrationNumber.trim()) { setErrorMsg("Company Registration Number is required."); return false; }
        if (!formData.businessWebsite.trim()) { setErrorMsg("Business Website is required."); return false; }
      }
      if (!formData.businessRegisteredAddress.trim()) { setErrorMsg(isSoleTrader ? "Business Address is required." : "Registered Business Address is required."); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(activeStep)) setActiveStep((prev) => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setErrorMsg("");
    setActiveStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // Always save the latest field values first — the backend service locks
      // already-approved fields by reading their values from the database
      // (ignoring what arrives in the DTO), so it's safe to resend everything.
      const payload: Partial<DealerKycData> = { ...formData, ...fileUrls };
      const response = await submitDealerKyc(payload);
      setKycData(response);

      if (alreadyPaid) {
        // £1 fee was already cleared in a previous cycle — submission is complete,
        // no Stripe redirect needed.
        setSuccessMsg("KYC documents submitted successfully! Our administrators have been notified.");
        await refreshProfile();
        setSubmitting(false);
        return;
      }

      // Redirect to Stripe's hosted Checkout page to collect the £1 verification fee.
      setCheckoutLoading(true);
      const checkout = await createKycCheckoutSession();
      if (checkout.alreadyPaid) {
        setAlreadyPaid(true);
        setPaidAt(checkout.chargedAt ?? null);
        setSuccessMsg("KYC documents submitted successfully! Our administrators have been notified.");
        await refreshProfile();
        setSubmitting(false);
        setCheckoutLoading(false);
        return;
      }
      if (checkout.url) {
        window.location.href = checkout.url;
        return; // navigating away — leave submitting/checkoutLoading true
      }
      setErrorMsg("Failed to start the payment. Please try again.");
      setSubmitting(false);
      setCheckoutLoading(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit KYC data. Please verify your fields and try again.");
      setSubmitting(false);
      setCheckoutLoading(false);
    }
  };

  // ─── Render Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md" style={{ background: 'var(--bg-body)' }}>
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <p className="text-sm tracking-wider uppercase text-[var(--text-muted)] font-semibold font-heading">
          Loading Security Profiles...
        </p>
      </div>
    );
  }

  // ─── Render "Approved" State ─────────────────────────────────────────────────
  // Edge case: if the KYC is APPROVED but the layout hasn't unmounted this
  // component yet (profile refresh still in-flight), show a success screen
  // and push to the dashboard so the layout re-evaluates the guard.
  if (kycData && kycData.status === "APPROVED") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-body)] backdrop-blur-xl p-4 overflow-y-auto">
        <div className="dealer-glass-card max-w-xl w-full p-8 md:p-10 border border-emerald-500/20 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-primary to-emerald-500" />
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-6">
            <CheckCircle2 size={40} className="text-emerald-400" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-heading text-[var(--text-primary)] tracking-tight mb-3">
            KYC APPROVED
          </h2>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8">
            Your dealership has been fully verified. Click below to access your dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard/dealer")}
            className="flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            <Check size={14} />
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Render "Under Review" State ─────────────────────────────────────────────
  // Requires stripeChargedAt too — a PENDING record with fields saved but the £1 fee
  // unpaid (e.g. dealer cancelled the Stripe Checkout redirect) must fall through to
  // the form below so they can retry payment, not get stuck behind this hard gate.
  if (kycData && kycData.status === "PENDING" && kycData.stripeChargedAt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-body)] backdrop-blur-xl p-4 overflow-y-auto">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="dealer-glass-card max-w-xl w-full p-8 md:p-10 border border-[var(--border-default)] relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-primary to-amber-500 animate-pulse" />

          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-white/10 text-xs font-bold text-[var(--text-muted)] transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-white/10 text-xs font-bold text-[var(--text-secondary)] transition-colors"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>

          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 relative animate-float">
            <Shield size={40} className="text-amber-500" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
            </span>
          </div>

          <h2 className="text-2xl md:text-3xl font-black font-heading text-[var(--text-primary)] tracking-tight mb-3">
            VERIFICATION IN PROGRESS
          </h2>

          <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-6">
            Your KYC application has been received and is currently under review by our superadmin team.
            Verification typically takes between 1–2 hours during business operations.
          </p>

          <div className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl p-5 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 size={16} className="text-primary" />
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Submitted Items Locker</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              All uploaded legal forms, company registry credentials, director IDs, and transfer statements are encrypted
              and locked. You will receive an automated email response as soon as our superadmin reviews your submission.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={async () => {
                setLoading(true);
                const kyc = await getDealerKyc();
                setKycData(kyc);
                await refreshProfile();
                if (kyc?.status === "APPROVED") {
                  router.push("/dashboard/dealer");
                } else {
                  setLoading(false);
                }
              }}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-neon"
            >
              <Loader2 className="animate-spin" size={14} />
              Check Status Now
            </button>
            <button
              onClick={handleSwitchToBuyer}
              disabled={switchingRole}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
            >
              {switchingRole ? <Loader2 className="animate-spin" size={14} /> : <User size={14} />}
              Become a Buyer / Seller
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render "Payment Outstanding" State ──────────────────────────────────────
  // status === PENDING but stripeChargedAt is null: the dealer already filled out
  // and saved their KYC details — they just never completed (or their card was
  // declined on, or they closed the tab during) the Stripe Checkout redirect.
  // This must NOT look like a fresh, unstarted application — it's one click away
  // from being submitted, not a re-do.
  if (kycData && kycData.status === "PENDING" && !kycData.stripeChargedAt) {
    const handleResumePayment = async () => {
      setErrorMsg("");
      setCheckoutLoading(true);
      try {
        const checkout = await createKycCheckoutSession();
        if (checkout.alreadyPaid) {
          setKycData({ ...kycData, stripeChargedAt: checkout.chargedAt ?? new Date().toISOString() } as DealerKycData);
          setCheckoutLoading(false);
          return;
        }
        if (checkout.url) {
          window.location.href = checkout.url;
          return; // navigating away — leave checkoutLoading true
        }
        setErrorMsg("Failed to start the payment. Please try again.");
        setCheckoutLoading(false);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to start the payment. Please try again.");
        setCheckoutLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-body)] backdrop-blur-xl p-4 overflow-y-auto">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="dealer-glass-card max-w-xl w-full p-8 md:p-10 border border-[var(--border-default)] relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-500 to-primary" />

          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-white/10 text-xs font-bold text-[var(--text-muted)] transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-white/10 text-xs font-bold text-[var(--text-secondary)] transition-colors"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>

          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
            <Lock size={40} className="text-primary" />
          </div>

          <h2 className="text-2xl md:text-3xl font-black font-heading text-[var(--text-primary)] tracking-tight mb-3">
            ALMOST THERE — PAYMENT NEEDED
          </h2>

          <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-6">
            Your KYC details are saved. The only thing left is the £1 verification payment — it looks like your last
            attempt didn&rsquo;t go through (card declined, or the checkout page was closed before it finished). No
            need to re-fill anything.
          </p>

          {errorMsg && (
            <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
            <button
              onClick={handleResumePayment}
              disabled={checkoutLoading}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-neon disabled:opacity-50"
            >
              {checkoutLoading ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
              {checkoutLoading ? "Redirecting to Stripe..." : "Complete Payment (£1)"}
            </button>
            <button
              onClick={handleSwitchToBuyer}
              disabled={switchingRole}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
            >
              {switchingRole ? <Loader2 className="animate-spin" size={14} /> : <User size={14} />}
              Become a Buyer / Seller
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render 3-Step Form Overlay ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-body)] backdrop-blur-xl overflow-y-auto custom-scrollbar">
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-3xl mx-auto px-4 py-8">
        {/* Header Block */}
        <div className="flex items-start sm:items-center justify-between mb-6 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
              <Shield className="text-primary" size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-black font-heading text-[var(--text-primary)] tracking-tight uppercase leading-tight">
                Dealer KYC Portal
              </h1>
              <p className="text-xs sm:text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold truncate">
                Verification Required for Dashboard Access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSkip}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-xs font-bold text-[var(--text-muted)] transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleSwitchToBuyer}
              disabled={switchingRole}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-bold text-blue-300 transition-colors disabled:opacity-50"
            >
              {switchingRole ? <Loader2 className="animate-spin" size={12} /> : <User size={12} />}
              Buyer / Seller
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-xs font-bold text-[var(--text-secondary)] transition-colors"
            >
              <LogOut size={13} />
              <span className="hidden xs:inline sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Info Box if Rejected */}
        {kycData && kycData.status === "REJECTED" && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
            <div>
              <h3 className="text-xs font-extrabold uppercase text-red-500 tracking-wider">
                Submission Requires Attention
              </h3>
              <p className="text-[var(--text-secondary)] text-xs mt-1 leading-relaxed">
                Superadmins have completed a review of your application. Specific fields were rejected and require
                revision. Previously approved fields are locked and marked with a verified badge. Please update the
                fields highlighted in red below.
              </p>
            </div>
          </div>
        )}

        {/* Steps Progress Indicator */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { step: 1, label: "Corporate Info", icon: Building2 },
            { step: 2, label: "Registrations", icon: FileSpreadsheet },
            { step: 3, label: "Payment Verification", icon: CreditCard },
          ].map((item) => {
            const isCompleted = activeStep > item.step;
            const isActive = activeStep === item.step;
            const StepIcon = item.icon;
            return (
              <div
                key={item.step}
                className={`p-2.5 sm:p-3.5 rounded-xl border transition-all duration-300 flex items-center gap-2 sm:gap-3 ${
                  isActive
                    ? "border-primary bg-primary/5 text-primary"
                    : isCompleted
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    isActive
                      ? "border-primary bg-primary text-white"
                      : isCompleted
                      ? "border-emerald-500 bg-emerald-500 text-slate-950"
                      : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)]"
                  }`}
                >
                  {isCompleted ? <Check size={14} /> : <StepIcon size={14} />}
                </div>
                <div className="hidden sm:block min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-widest opacity-60 leading-none mb-0.5">Step 0{item.step}</p>
                  <p className="text-xs font-bold font-heading truncate">{item.label}</p>
                </div>
                <div className="sm:hidden">
                  <p className="text-xs font-extrabold uppercase tracking-widest opacity-60">{item.step}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="dealer-glass-card p-6 md:p-8 border border-[var(--border-default)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              {/* ── STEP 1: CORPORATE DETAILS ── */}
              {activeStep === 1 && (
                <div className="space-y-5">
                  <h3 className="text-base font-extrabold uppercase text-[var(--text-primary)] tracking-tight border-b border-[var(--border-default)] pb-2">
                    Step 1: Representative &amp; Company Details
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {renderInput({
                      label: isSoleTrader ? "Trading Name" : "Company House Registered Name",
                      name: "companyHouseName",
                      value: formData.companyHouseName,
                      placeholder: isSoleTrader ? "e.g. Carmazium Motors" : "e.g. Carmazium Dealership Ltd",
                      icon: Building2,
                    })}
                    {renderInput({
                      label: isSoleTrader ? "Owner Full Name" : "Lead Director Full Name",
                      name: "directorName",
                      value: formData.directorName,
                      placeholder: "e.g. Arthur Pendragon",
                      icon: User,
                    })}
                    {renderInput({ label: "Account Representative Full Name", name: "representativeName", value: formData.representativeName, placeholder: "e.g. John Doe", icon: User })}
                    {renderInput({ label: "Representative Job Title", name: "representativePosition", value: formData.representativePosition, placeholder: "e.g. Head of Acquisitions", icon: User })}

                    {/* PSC is a Companies House filing concept. A sole trader has
                        no ownership structure to declare — they are it. */}
                    {!isSoleTrader && (
                      <div className="md:col-span-2">
                        {renderInput({ label: "Person of Significant Control (PSC)", name: "personOfSignificantControl", value: formData.personOfSignificantControl, placeholder: "e.g. Arthur Pendragon (85% Ownership)", icon: User })}
                      </div>
                    )}
                  </div>

                  {/* Director ID Upload */}
                  <div className="pt-2 border-t border-[var(--border-default)]">
                    <p className="text-xs font-extrabold uppercase text-primary tracking-widest mb-3 flex items-center gap-1.5">
                      <IdCard size={11} />
                      Supporting Document Upload
                    </p>
                    <FileUploadField
                      label={isSoleTrader ? "Driving License or Passport" : "Director ID / Passport Photo"}
                      hint="Passport, driving licence, or national ID · JPG, PNG, PDF · Max 10MB"
                      fieldName="directorIdProof"
                      value={fileUrls.directorIdProof}
                      onUpload={handleFileUpload}
                      onClear={handleFileClear}
                      isApproved={isFieldApproved("directorIdProof")}
                      rejectionNote={getFieldRejectionNote("directorIdProof")}
                      isSubmitting={submitting}
                      icon={IdCard}
                    />
                  </div>
                </div>
              )}

              {/* ── STEP 2: COMMERCIAL REGISTRATIONS ── */}
              {activeStep === 2 && (
                <div className="space-y-5">
                  <h3 className="text-base font-extrabold uppercase text-[var(--text-primary)] tracking-tight border-b border-[var(--border-default)] pb-2">
                    Step 2: Registrations &amp; Business Address
                  </h3>

                  {/* Business type decides the whole step. Radios rather than
                      styled divs so arrow keys move between them and screen
                      readers announce the group and the current selection. */}
                  <fieldset className="space-y-3">
                    <legend className="text-xs font-extrabold uppercase text-primary tracking-widest mb-3 flex items-center gap-1.5">
                      <Building2 size={11} />
                      Business Type
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {BUSINESS_TYPE_OPTIONS.map((opt) => {
                        const selected = formData.businessType === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${selected
                              ? "border-primary bg-primary/5"
                              : "border-[var(--border-default)] bg-[var(--bg-input)] hover:border-primary/40"}`}
                          >
                            <input
                              type="radio"
                              name="businessType"
                              value={opt.value}
                              checked={selected}
                              disabled={submitting}
                              onChange={() => setFormData((f) => ({ ...f, businessType: opt.value }))}
                              className="mt-0.5 shrink-0 accent-primary"
                            />
                            <span>
                              <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                                {opt.label}
                              </span>
                              <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                                {opt.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isSoleTrader
                        ? "Sole traders have no VAT number and no Companies House record, so we verify you with photo ID and proof of address instead."
                        : "We will ask for your VAT number and Companies House details."}
                    </p>
                  </fieldset>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Limited-company registrations. A sole trader has neither,
                        so these are removed rather than shown and left blank. */}
                    {!isSoleTrader && renderInput({ label: "VAT Registration Number", name: "vatNumber", value: formData.vatNumber, placeholder: "e.g. GB 123456789", icon: FileSpreadsheet })}
                    {!isSoleTrader && renderInput({ label: "Company House Registration Number", name: "companyRegistrationNumber", value: formData.companyRegistrationNumber, placeholder: "e.g. 12345678", icon: FileSpreadsheet })}
                    {renderInput({
                      label: isSoleTrader ? "Business Website URL (Optional)" : "Corporate Website URL",
                      name: "businessWebsite",
                      value: formData.businessWebsite,
                      placeholder: "e.g. https://www.mydealership.co.uk",
                      icon: Globe,
                    })}
                    {renderInput({ label: "Google Reviews Listing Link (Optional)", name: "googleReviewsLink", value: formData.googleReviewsLink, placeholder: "e.g. https://g.page/r/...", icon: Globe })}

                    <div className="md:col-span-2">
                      {renderTextarea({
                        label: isSoleTrader ? "Business Address" : "Registered Business Address",
                        name: "businessRegisteredAddress",
                        value: formData.businessRegisteredAddress,
                        placeholder: "e.g. 12 Guildhall St, Folkestone, Kent, CT20 1EE",
                        icon: MapPin,
                      })}
                    </div>
                    <div className="md:col-span-2">
                      {renderTextarea({
                        label: isSoleTrader ? "Trading Address (If different from the address above)" : "Trading Address (If different from Registered Address)",
                        name: "tradingAddress",
                        value: formData.tradingAddress,
                        placeholder: "Leave empty if identical to registered address",
                        icon: MapPin,
                      })}
                    </div>
                  </div>

                  {/* Document Proof Uploads */}
                  <div className="pt-2 border-t border-[var(--border-default)] space-y-4">
                    <p className="text-xs font-extrabold uppercase text-primary tracking-widest flex items-center gap-1.5">
                      <FileCheck size={11} />
                      Supporting Document Uploads
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {isSoleTrader ? (
                        <>
                          {/* Same storage field as the limited-company flow uses in
                              Step 1 — a sole trader IS the director, so there is one
                              photo ID either way. It is surfaced again here because
                              for them it is the primary evidence, not a supporting
                              document, and Step 2 is where verification is decided. */}
                          <FileUploadField
                            label="Driving License or Passport"
                            hint="Photo ID for the business owner · JPG, PNG, PDF · Max 10MB"
                            fieldName="directorIdProof"
                            value={fileUrls.directorIdProof}
                            onUpload={handleFileUpload}
                            onClear={handleFileClear}
                            isApproved={isFieldApproved("directorIdProof")}
                            rejectionNote={getFieldRejectionNote("directorIdProof")}
                            isSubmitting={submitting}
                            icon={IdCard}
                          />
                          <FileUploadField
                            label="Proof of Address"
                            hint="Utility bill, council tax or bank statement from the last 3 months · JPG, PNG, PDF · Max 10MB"
                            fieldName="proofOfAddress"
                            value={fileUrls.proofOfAddress}
                            onUpload={handleFileUpload}
                            onClear={handleFileClear}
                            isApproved={isFieldApproved("proofOfAddress")}
                            rejectionNote={getFieldRejectionNote("proofOfAddress")}
                            isSubmitting={submitting}
                            icon={FileCheck}
                          />
                        </>
                      ) : (
                        <>
                          <FileUploadField
                            label="VAT Certificate / Registration Proof"
                            hint="HMRC VAT registration letter or certificate · JPG, PNG, PDF · Max 10MB"
                            fieldName="vatProof"
                            value={fileUrls.vatProof}
                            onUpload={handleFileUpload}
                            onClear={handleFileClear}
                            isApproved={isFieldApproved("vatProof")}
                            rejectionNote={getFieldRejectionNote("vatProof")}
                            isSubmitting={submitting}
                            icon={FileCheck}
                          />
                          <FileUploadField
                            label="Company House Certificate"
                            hint="Certificate of Incorporation or Companies House printout · JPG, PNG, PDF · Max 10MB"
                            fieldName="companyRegistrationProof"
                            value={fileUrls.companyRegistrationProof}
                            onUpload={handleFileUpload}
                            onClear={handleFileClear}
                            isApproved={isFieldApproved("companyRegistrationProof")}
                            rejectionNote={getFieldRejectionNote("companyRegistrationProof")}
                            isSubmitting={submitting}
                            icon={FileCheck}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3: PAYMENT VERIFICATION ── */}
              {activeStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-widest mb-1">
                      Step 3: Payment Verification
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Verify your identity with a £1 charge. This fee is non-refundable and covers the cost of your KYC review.
                    </p>
                  </div>

                  {alreadyPaid ? (
                    /* Already-paid state — green tick */
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
                      <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-extrabold text-emerald-400">Verification fee paid</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          £1 charged
                          {paidAt ? ` on ${new Date(paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Not yet paid — explain the redirect, the actual button lives in Form Actions below */
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)]">
                        <p className="text-xs font-extrabold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                          Verification Fee
                        </p>
                        <p className="text-lg font-extrabold">£1.00</p>
                        <p className="text-[11px] text-[var(--text-muted)]">Non-refundable · charged once per dealer account</p>
                      </div>

                      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] flex items-start gap-3">
                        <Lock size={16} className="text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                            Secure payment via Stripe
                          </p>
                          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            Your form details are saved first. Clicking &ldquo;Pay £1 &amp; Submit&rdquo; below takes you to Stripe&rsquo;s
                            secure checkout page to complete the charge — card details are never entered on this site.
                          </p>
                        </div>
                      </div>

                      {errorMsg === '' && checkoutLoading && (
                        <div className="flex items-center justify-center gap-3 py-2 text-[var(--text-muted)]">
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-xs font-semibold">Redirecting you to Stripe...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Alert Messages */}
          {errorMsg && (
            <div className="mt-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-2.5 text-xs text-red-500">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mt-6 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-2.5 text-xs text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="mt-8 pt-6 border-t border-[var(--border-default)] flex items-center justify-between">
            {activeStep > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] text-xs font-bold text-[var(--text-secondary)] transition-colors disabled:opacity-50"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            ) : (
              <div />
            )}

            {activeStep < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-widest shadow-neon transition-all"
              >
                Continue
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-[var(--bg-input)] disabled:text-[var(--text-muted)] text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    {checkoutLoading ? "Redirecting to Stripe..." : "Submitting..."}
                  </>
                ) : alreadyPaid ? (
                  <>
                    <Check size={14} />
                    Finalize Submission
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    Pay £1 &amp; Submit
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  // ─── Helper: Text Input Field ─────────────────────────────────────────────────
  function renderInput({
    label, name, value, placeholder, icon: Icon,
  }: {
    label: string;
    name: keyof typeof formData;
    value: string;
    placeholder: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }) {
    const isApproved = isFieldApproved(name);
    const rejectionNote = getFieldRejectionNote(name);
    return (
      <div className="space-y-1.5 text-left">
        <label className="text-xs font-extrabold uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
          <span>{label}</span>
          {isApproved && (
            <span className="flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <Lock size={8} /> LOCKED &amp; VERIFIED
            </span>
          )}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-muted)]">
            <Icon size={14} className={isApproved ? "text-emerald-500" : rejectionNote ? "text-red-500" : ""} />
          </div>
          <input
            type="text"
            name={name}
            value={value}
            onChange={handleInputChange}
            disabled={isApproved || submitting}
            placeholder={placeholder}
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-[var(--text-secondary)] text-xs font-semibold placeholder:text-[var(--text-muted)] transition-all ${
              isApproved
                ? "bg-[var(--bg-input)] border-emerald-500/30 text-[var(--text-muted)] select-none pointer-events-none"
                : rejectionNote
                ? "bg-red-500/5 border-red-500/40 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                : "bg-[var(--bg-input)] border-[var(--border-default)] focus:border-primary focus:ring-1 focus:ring-primary"
            }`}
          />
        </div>
        {rejectionNote && (
          <p className="text-xs text-red-500 font-semibold leading-relaxed flex items-start gap-1">
            <AlertCircle size={10} className="shrink-0 mt-0.5" />
            <span>{rejectionNote}</span>
          </p>
        )}
      </div>
    );
  }

  // ─── Helper: Textarea Field ───────────────────────────────────────────────────
  function renderTextarea({
    label, name, value, placeholder, icon: Icon,
  }: {
    label: string;
    name: keyof typeof formData;
    value: string;
    placeholder: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }) {
    const isApproved = isFieldApproved(name);
    const rejectionNote = getFieldRejectionNote(name);
    return (
      <div className="space-y-1.5 text-left">
        <label className="text-xs font-extrabold uppercase text-[var(--text-muted)] tracking-wider flex items-center justify-between">
          <span>{label}</span>
          {isApproved && (
            <span className="flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              <Lock size={8} /> LOCKED &amp; VERIFIED
            </span>
          )}
        </label>
        <div className="relative">
          <div className="absolute top-3 left-3.5 flex items-start pointer-events-none text-[var(--text-muted)]">
            <Icon size={14} className={isApproved ? "text-emerald-500" : rejectionNote ? "text-red-500" : ""} />
          </div>
          <textarea
            name={name}
            value={value}
            onChange={handleInputChange}
            disabled={isApproved || submitting}
            placeholder={placeholder}
            rows={2}
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-[var(--text-secondary)] text-xs font-semibold placeholder:text-[var(--text-muted)] transition-all resize-none ${
              isApproved
                ? "bg-[var(--bg-input)] border-emerald-500/30 text-[var(--text-muted)] select-none pointer-events-none"
                : rejectionNote
                ? "bg-red-500/5 border-red-500/40 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                : "bg-[var(--bg-input)] border-[var(--border-default)] focus:border-primary focus:ring-1 focus:ring-primary"
            }`}
          />
        </div>
        {rejectionNote && (
          <p className="text-xs text-red-500 font-semibold leading-relaxed flex items-start gap-1">
            <AlertCircle size={10} className="shrink-0 mt-0.5" />
            <span>{rejectionNote}</span>
          </p>
        )}
      </div>
    );
  }
}
