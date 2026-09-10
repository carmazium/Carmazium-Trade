"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
    X, Loader2, Mail, ShieldCheck, Ban, LockKeyhole,
    LockKeyholeOpen, Building2, FileText, ExternalLink, Star, Car, Receipt, CreditCard, BadgeCheck,
    AlertTriangle, Download, MessageCircle,
} from "lucide-react"
import { getAdminUserDetail, banUser, unbanUser, lockUser, unlockUser } from "@/lib/adminApi"
import { formatPrice } from "@/lib/listingApi"

function fmtDate(d: string | null | undefined) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtDateTime(d: string | null | undefined) {
    if (!d) return "—"
    return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
    return (
        <div className="border-t border-[var(--border-default)] pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
            <h4 className="text-xs font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                <Icon size={13} /> {title}
            </h4>
            {children}
        </div>
    )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    if (value === null || value === undefined || value === "") return null
    return (
        <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</p>
            <p className="text-sm font-medium break-words">{value}</p>
        </div>
    )
}

const KYC_DOC_FIELDS: { key: string; label: string }[] = [
    { key: "vatProof", label: "VAT Proof" },
    { key: "proofOfAddress", label: "Proof of Address" },
    { key: "companyRegistrationProof", label: "Company Registration Cert" },
    { key: "directorIdProof", label: "Director ID / Passport" },
    { key: "paymentScreenshot", label: "Payment Screenshot" },
]

async function exportUserDetailPdf(detail: any) {
    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginBottom = 15
    let y = 20

    const checkPageBreak = (needed: number) => {
        if (y + needed > pageHeight - marginBottom) {
            doc.addPage()
            y = 20
        }
    }
    const addSection = (title: string) => {
        checkPageBreak(16)
        y += 2
        doc.setFont("helvetica", "bold")
        doc.setFontSize(12)
        doc.setTextColor(30)
        doc.text(title, 14, y)
        y += 2
        doc.setDrawColor(210)
        doc.line(14, y + 1, 196, y + 1)
        y += 8
    }
    const addField = (label: string, value: unknown) => {
        if (value === null || value === undefined || value === "") return
        checkPageBreak(10)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(120)
        doc.text(label.toUpperCase(), 14, y)
        y += 4
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10)
        doc.setTextColor(20)
        const lines = doc.splitTextToSize(String(value), 180)
        doc.text(lines, 14, y)
        y += lines.length * 5 + 3
    }
    const addLine = (text: string) => {
        checkPageBreak(6)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.setTextColor(20)
        doc.text(text, 14, y)
        y += 5
    }
    const addSubheading = (text: string) => {
        checkPageBreak(8)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(9)
        doc.setTextColor(90)
        doc.text(text, 14, y)
        y += 5
    }

    const name = [detail.firstName, detail.lastName].filter(Boolean).join(" ") || detail.email || "User"
    const kyc = detail?.dealerProfile?.kyc
    const documentStatuses: Record<string, { status: string; note?: string }> = kyc?.documentStatuses || {}

    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(20)
    doc.text("CarMazium — User Detail Report", 14, y)
    y += 7
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 14, y)
    y += 10

    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.setTextColor(20)
    doc.text(name, 14, y)
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(90)
    const flags = [
        `Role: ${detail.role}`,
        detail.deletedAt ? "BANNED" : null,
        detail.lockoutUntil && new Date(detail.lockoutUntil) > new Date() ? "LOCKED" : null,
    ].filter(Boolean).join(" · ")
    doc.text(flags, 14, y)
    y += 10

    addSection("Contact & Account")
    addField("Email", detail.email)
    addField("Phone", detail.phone)
    addField("Location", [detail.location, detail.postcode].filter(Boolean).join(", "))
    addField("Joined", fmtDate(detail.createdAt))
    addField("Last Updated", fmtDateTime(detail.updatedAt))
    addField("Login Attempts", detail.loginAttempts)

    if (detail.bankAccountNumber || detail.stripeConnectAccountId) {
        addSection("Payout Info")
        addField("Payout Method", detail.payoutPreference)
        addField("Stripe Connect", detail.stripeConnectOnboardingComplete ? "Onboarded" : "Not complete")
        addField("Bank Account Name", detail.bankAccountName)
        addField("Sort Code", detail.bankSortCode)
        addField("Account Number", detail.bankAccountNumber)
    }

    if (detail.dealerProfile) {
        addSection("Dealer Profile")
        addField("Company Name", detail.dealerProfile.companyName)
        addField("Verified", detail.dealerProfile.isVerified ? "Yes" : "No")
        addField("VAT Number", detail.dealerProfile.vatNumber)
        addField("Registration No.", detail.dealerProfile.registrationNumber)
        addField("Business Address", detail.dealerProfile.businessAddress)
        addField("Business Phone", detail.dealerProfile.phone)
        addField("Website", detail.dealerProfile.website)
    }

    if (kyc) {
        addSection("KYC Record")
        addField("Status", kyc.status)
        addField("Submitted", fmtDateTime(kyc.submittedAt))
        addField("Reviewed", kyc.reviewedAt ? fmtDateTime(kyc.reviewedAt) : "Not yet reviewed")
        addField("Company House Name", kyc.companyHouseName)
        addField("Company Reg. No.", kyc.companyRegistrationNumber)
        addField("Representative", kyc.representativeName)
        addField("Representative Role", kyc.representativePosition)
        addField("Director", kyc.directorName)
        addField("Person of Significant Control", kyc.personOfSignificantControl)
        addField("Business Website", kyc.businessWebsite)
        addField("Registered Address", kyc.businessRegisteredAddress)
        addField("Trading Address", kyc.tradingAddress)
        addField("£1 Fee Charged", kyc.stripeChargedAt ? fmtDateTime(kyc.stripeChargedAt) : "Not paid")

        addSubheading("SUBMITTED DOCUMENTS")
        KYC_DOC_FIELDS.forEach(({ key, label }) => {
            const url = kyc[key]
            const fieldStatus = documentStatuses[key]
            const statusText = fieldStatus ? ` [${fieldStatus.status}]` : ""
            addLine(`${label}${statusText}: ${url || "Not provided"}`)
        })
        y += 3
    }

    if (detail.sellerProfile) {
        addSection("Seller Profile")
        addField("Reliability Score", `${detail.sellerProfile.reliabilityScore.toFixed(1)} / 5.0`)
        addField("Total Sales", detail.sellerProfile.totalSales)
        addField("Total Listings", detail.sellerProfile.totalListings)
        addField("Response Rate", `${detail.sellerProfile.responseRate}%`)
    }

    addSection("Activity")
    addField("Listings", detail._count?.listings ?? 0)
    addField("Transactions", detail._count?.transactions ?? 0)
    addField("Auctions Won", detail._count?.wonAuctions ?? 0)

    if (detail.recentListings?.length > 0) {
        addSubheading("RECENT LISTINGS")
        detail.recentListings.forEach((l: any) => addLine(`${l.title} — ${formatPrice(l.price)} — ${l.status}`))
        y += 3
    }

    if (detail.recentTransactions?.length > 0) {
        addSubheading("RECENT TRANSACTIONS")
        detail.recentTransactions.forEach((t: any) => addLine(`${t.type} — ${formatPrice(Number(t.amount))} — ${t.status}`))
    }

    const safeName = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    doc.save(`carmazium-user-${safeName}-${Date.now()}.pdf`)
}

export function UserDetailModal({ userId, onClose, onChanged, onMessage }: { userId: string | null; onClose: () => void; onChanged?: () => void; onMessage?: (userId: string) => void }) {
    const [detail, setDetail] = React.useState<any | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [acting, setActing] = React.useState(false)
    const [exporting, setExporting] = React.useState(false)

    const load = React.useCallback(() => {
        if (!userId) return
        setLoading(true)
        setError(null)
        getAdminUserDetail(userId)
            .then(setDetail)
            .catch(err => setError(err.message || "Failed to load user details"))
            .finally(() => setLoading(false))
    }, [userId])

    React.useEffect(() => { load() }, [load])

    if (!userId) return null

    const handleAction = async (action: "ban" | "unban" | "lock" | "unlock") => {
        setActing(true)
        try {
            if (action === "ban") await banUser(userId)
            else if (action === "unban") await unbanUser(userId)
            else if (action === "lock") await lockUser(userId)
            else await unlockUser(userId)
            load()
            onChanged?.()
        } catch (err: any) {
            alert(err.message || `Failed to ${action} user`)
        } finally {
            setActing(false)
        }
    }

    const handleExportPdf = async () => {
        if (!detail) return
        setExporting(true)
        try {
            await exportUserDetailPdf(detail)
        } catch (err: any) {
            alert(err.message || "Failed to generate PDF")
        } finally {
            setExporting(false)
        }
    }

    const kyc = detail?.dealerProfile?.kyc
    const documentStatuses: Record<string, { status: string; note?: string }> = kyc?.documentStatuses || {}
    const name = [detail?.firstName, detail?.lastName].filter(Boolean).join(" ") || detail?.email || "User"

    if (typeof document === "undefined") return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg h-full bg-[var(--bg-card)] border-l border-[var(--border-default)] shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 flex items-center justify-between p-5 border-b border-[var(--border-default)] bg-[var(--bg-card)]">
                    <h3 className="text-lg font-black uppercase tracking-tight">User Details</h3>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {loading && !detail && (
                        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
                    )}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm mb-4">{error}</div>
                    )}

                    {detail && (
                        <>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <div>
                                    <h2 className="text-xl font-bold">{name}</h2>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{detail.role}</span>
                                        {detail.deletedAt && <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">BANNED</span>}
                                        {detail.lockoutUntil && new Date(detail.lockoutUntil) > new Date() && (
                                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">LOCKED</span>
                                        )}
                                        {detail.isEmailVerified && <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1"><BadgeCheck size={11} /> Verified</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Admin actions */}
                            {onMessage && (
                                <button
                                    onClick={() => onMessage(userId)}
                                    className="w-full mb-2 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <MessageCircle size={13} /> Message {name.split(" ")[0]}
                                </button>
                            )}
                            <div className="flex gap-2 mb-4">
                                {detail.deletedAt ? (
                                    <button disabled={acting} onClick={() => handleAction("unban")} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer">Unban</button>
                                ) : (
                                    <button disabled={acting} onClick={() => handleAction("ban")} className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"><Ban size={13} /> Ban</button>
                                )}
                                {detail.lockoutUntil && new Date(detail.lockoutUntil) > new Date() ? (
                                    <button disabled={acting} onClick={() => handleAction("unlock")} className="flex-1 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-widest hover:bg-blue-500/20 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"><LockKeyholeOpen size={13} /> Unlock</button>
                                ) : (
                                    <button disabled={acting} onClick={() => handleAction("lock")} className="flex-1 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold uppercase tracking-widest hover:bg-yellow-500/20 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"><LockKeyhole size={13} /> Lock</button>
                                )}
                            </div>

                            {/* Contact & Account */}
                            <Section title="Contact & Account" icon={Mail}>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Email" value={<a href={`mailto:${detail.email}`} className="hover:text-primary transition-colors">{detail.email}</a>} />
                                    <Field label="Phone" value={detail.phone ? <a href={`tel:${detail.phone}`} className="hover:text-primary transition-colors">{detail.phone}</a> : "Not on file"} />
                                    <Field label="Location" value={[detail.location, detail.postcode].filter(Boolean).join(", ") || "—"} />
                                    <Field label="Joined" value={fmtDate(detail.createdAt)} />
                                    <Field label="Last Updated" value={fmtDateTime(detail.updatedAt)} />
                                    <Field label="Login Attempts" value={detail.loginAttempts} />
                                </div>
                            </Section>

                            {/* Payout */}
                            {(detail.bankAccountNumber || detail.stripeConnectAccountId) && (
                                <Section title="Payout Info" icon={CreditCard}>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Payout Method" value={detail.payoutPreference} />
                                        <Field label="Stripe Connect" value={detail.stripeConnectOnboardingComplete ? "Onboarded" : "Not complete"} />
                                        <Field label="Bank Account Name" value={detail.bankAccountName} />
                                        <Field label="Sort Code" value={detail.bankSortCode} />
                                        <Field label="Account Number" value={detail.bankAccountNumber} />
                                    </div>
                                </Section>
                            )}

                            {/* Dealer profile */}
                            {detail.dealerProfile && (
                                <Section title="Dealer Profile" icon={Building2}>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Company Name" value={detail.dealerProfile.companyName} />
                                        <Field label="Verified" value={detail.dealerProfile.isVerified ? "Yes" : "No"} />
                                        <Field label="VAT Number" value={detail.dealerProfile.vatNumber} />
                                        <Field label="Registration No." value={detail.dealerProfile.registrationNumber} />
                                        <Field label="Business Address" value={detail.dealerProfile.businessAddress} />
                                        <Field label="Business Phone" value={detail.dealerProfile.phone} />
                                        <Field label="Website" value={detail.dealerProfile.website ? <a href={detail.dealerProfile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Visit <ExternalLink size={11} /></a> : null} />
                                    </div>
                                </Section>
                            )}

                            {/* KYC */}
                            {kyc && (
                                <Section title="KYC Record" icon={ShieldCheck}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                                            kyc.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            kyc.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        }`}>{kyc.status}</span>
                                        <span className="text-xs text-[var(--text-muted)]">Submitted {fmtDateTime(kyc.submittedAt)}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <Field label="Company House Name" value={kyc.companyHouseName} />
                                        <Field label="Company Reg. No." value={kyc.companyRegistrationNumber} />
                                        <Field label="Representative" value={kyc.representativeName} />
                                        <Field label="Representative Role" value={kyc.representativePosition} />
                                        <Field label="Director" value={kyc.directorName} />
                                        <Field label="Person of Significant Control" value={kyc.personOfSignificantControl} />
                                        <Field label="Business Website" value={kyc.businessWebsite} />
                                        <Field label="Registered Address" value={kyc.businessRegisteredAddress} />
                                        <Field label="Trading Address" value={kyc.tradingAddress} />
                                        <Field label="£1 Fee Charged" value={kyc.stripeChargedAt ? fmtDateTime(kyc.stripeChargedAt) : "Not paid"} />
                                        <Field label="Reviewed" value={kyc.reviewedAt ? fmtDateTime(kyc.reviewedAt) : "Not yet reviewed"} />
                                    </div>

                                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">Submitted Documents</p>
                                    <div className="space-y-1.5 mb-3">
                                        {KYC_DOC_FIELDS.map(({ key, label }) => {
                                            const url = kyc[key]
                                            const fieldStatus = documentStatuses[key]
                                            return (
                                                <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-xs">
                                                    <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><FileText size={12} /> {label}</span>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {fieldStatus && (
                                                            <span className={`font-bold ${fieldStatus.status === 'APPROVED' ? 'text-emerald-400' : fieldStatus.status === 'REJECTED' ? 'text-red-400' : 'text-amber-400'}`}>{fieldStatus.status}</span>
                                                        )}
                                                        {url ? (
                                                            <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">View <ExternalLink size={11} /></a>
                                                        ) : (
                                                            <span className="text-[var(--text-faint)]">Not provided</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {Object.entries(documentStatuses).some(([, v]) => v.status === 'REJECTED' && v.note) && (
                                        <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-xs space-y-1">
                                            <p className="font-bold text-red-400 flex items-center gap-1"><AlertTriangle size={11} /> Rejection notes</p>
                                            {Object.entries(documentStatuses).filter(([, v]) => v.status === 'REJECTED' && v.note).map(([field, v]) => (
                                                <p key={field} className="text-[var(--text-muted)]"><span className="font-bold">{field}:</span> {v.note}</p>
                                            ))}
                                        </div>
                                    )}
                                </Section>
                            )}

                            {/* Seller profile */}
                            {detail.sellerProfile && (
                                <Section title="Seller Profile" icon={Star}>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Reliability Score" value={`${detail.sellerProfile.reliabilityScore.toFixed(1)} / 5.0`} />
                                        <Field label="Total Sales" value={detail.sellerProfile.totalSales} />
                                        <Field label="Total Listings" value={detail.sellerProfile.totalListings} />
                                        <Field label="Response Rate" value={`${detail.sellerProfile.responseRate}%`} />
                                    </div>
                                </Section>
                            )}

                            {/* Activity counts */}
                            <Section title="Activity" icon={Car}>
                                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                                    <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]">
                                        <p className="text-lg font-bold">{detail._count?.listings ?? 0}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Listings</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]">
                                        <p className="text-lg font-bold">{detail._count?.transactions ?? 0}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Transactions</p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]">
                                        <p className="text-lg font-bold">{detail._count?.wonAuctions ?? 0}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Auctions Won</p>
                                    </div>
                                </div>

                                {detail.recentListings?.length > 0 && (
                                    <div className="space-y-1.5 mb-3">
                                        {detail.recentListings.map((l: any) => (
                                            <Link key={l.id} href={`/buy-cars/${l.slug}`} target="_blank" className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-xs hover:border-primary/40 transition-colors">
                                                <span className="truncate max-w-[180px]">{l.title}</span>
                                                <span className="text-[var(--text-muted)] shrink-0">{formatPrice(l.price)} · {l.status}</span>
                                            </Link>
                                        ))}
                                    </div>
                                )}

                                {detail.recentTransactions?.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1"><Receipt size={11} /> Recent Transactions</p>
                                        {detail.recentTransactions.map((t: any) => (
                                            <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-xs">
                                                <span>{t.type} <span className="text-[var(--text-muted)]">· {t.status}</span></span>
                                                <span className="font-bold">{formatPrice(t.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Section>
                        </>
                    )}
                </div>

                {detail && (
                    <div className="shrink-0 p-5 border-t border-[var(--border-default)] bg-[var(--bg-card)]">
                        <button
                            onClick={handleExportPdf}
                            disabled={exporting}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-white text-sm font-black uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-neon"
                        >
                            {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            Export as PDF
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
