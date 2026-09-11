from pathlib import Path


def replace_exact(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8-sig")
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Terms: fee split, contact gate, HPI rules, and transport-service money flow.
terms = Path("src/app/terms/page.tsx")
text = terms.read_text(encoding="utf-8-sig")
old = '''        title: "£125 Auction Buyer Fee",
        blocks: [
            p("Fee. Where a Vehicle is successfully purchased through a CarMazium Auction, the Successful Auction Buyer must pay CarMazium the applicable Auction Buyer Fee. The current fee is £125 per successfully purchased Auction Vehicle, unless another amount is clearly displayed before the Dealer bids."),
            p("Separate from Purchase Price. The £125 fee is payable to CarMazium. The Vehicle Purchase Price is payable directly to the Seller. These are completely separate payments."),
            p("Retail exemption. The £125 Auction Buyer Fee does not apply to Vehicles purchased through Retail Listings."),
            p("VAT. Where VAT is legally chargeable on a CarMazium fee, the Platform or invoice will state the applicable VAT treatment."),
        ],'''
new = '''        title: "£125 Auction Buyer Fee",
        blocks: [
            p("Fee. The Successful Auction Buyer pays CarMazium one total Auction Buyer Fee of £125. The £125 consists of a £100 refundable portion and a £25 CarMazium platform fee."),
            p("£100 refundable portion. The £100 portion is refundable only where CarMazium determines that a genuine qualifying Auction sale has failed or been cancelled before successful Handover. A rejected or unclear Handover Evidence submission does not by itself mean the Vehicle sale failed and does not trigger a Buyer refund; the Seller may be asked to resubmit clearer evidence."),
            p("£25 platform fee. The £25 platform-fee portion is non-refundable in all cases, subject always to statutory rights that cannot lawfully be excluded."),
            p("Contact unlock. The Successful Auction Buyer must pay the £125 Auction Buyer Fee before the Seller's protected contact details and Auction chat are unlocked."),
            p("Separate from Purchase Price. The £125 fee is payable to CarMazium. The Vehicle Purchase Price is payable directly to the Seller after inspection and agreement. CarMazium does not receive, hold or process the Vehicle Purchase Price."),
            p("Retail exemption. The £125 Auction Buyer Fee does not apply to Vehicles purchased through Retail Listings."),
            p("VAT. Where VAT is legally chargeable on a CarMazium fee, the Platform or invoice will state the applicable VAT treatment."),
        ],'''
if old not in text:
    raise SystemExit("Terms section 20 shape changed")
text = text.replace(old, new, 1)

replacements = [
    (
        'p("After a successful Auction, CarMazium may provide the parties with the contact information necessary to complete the transaction. The successful Dealer must make reasonable efforts to contact the Seller promptly. Seller and Dealer should cooperate in arranging collection and inspection."),',
        'p("After the successful Dealer has paid the £125 Auction Buyer Fee, CarMazium may unlock the Seller contact information and Auction chat necessary to complete the transaction. The successful Dealer should then contact the Seller promptly and the parties should cooperate in arranging inspection and collection. Seller contact details remain protected until the fee is confirmed."),',
    ),
    (
        'p("CarMazium may display information obtained from third-party providers, such as MOT information, Vehicle specification, finance indicators, valuation data, insurance category, and history information. Third-party data may contain errors or delays. CarMazium does not warrant that third-party databases are complete or error-free."),',
        'p("CarMazium may display information obtained from third-party providers, such as MOT information, Vehicle specification, finance indicators, valuation data, insurance category, and history information. Third-party data may contain errors or delays. CarMazium does not warrant that third-party databases are complete or error-free."),\n            p("Mandatory HPI. Every Vehicle Listing must have a CarMazium HPI/history-report request associated with it before the Listing can be approved to go live. A report may still be marked PENDING while CarMazium prepares it; a pending report does not by itself delay publication once the Listing has otherwise passed review."),\n            p("HPI on relisting. An Auction relist may reuse the existing HPI report for that Vehicle where CarMazium permits reuse, provided the Seller updates all current buyer-facing notes, condition disclosures and other material information. A Retail Listing or Retail relist requires a fresh HPI report and does not inherit an Auction report automatically."),',
    ),
    (
        '"Auction Buyer Fee: £125",',
        '"Auction Buyer Fee: £125 total (£100 refundable only for a qualifying genuine failed/cancelled Auction sale; £25 platform fee non-refundable in all cases, subject to statutory rights)",',
    ),
    (
        'p("Any optional service that carries an additional charge must be clearly identified. Users will not be charged for optional extras without appropriate agreement."),',
        'p("Any optional service that carries an additional charge must be clearly identified. Users will not be charged for optional extras without appropriate agreement."),\n            p("Trade Exchange Delivery & Recovery is an optional transport-service marketplace. CarMazium may collect payment for the transport service itself and currently retains a 9% service marketplace fee, with the balance due to the approved contractor after completion subject to the applicable service/dispute process. This transport-service payment is separate from the Vehicle Purchase Price and does not mean CarMazium receives or holds Vehicle sale funds."),',
    ),
    (
        'p("Any entitlement to refund of a CarMazium Platform fee will depend on applicable consumer law, whether the service has begun or been supplied, the reason for cancellation, the specific service purchased, and any separate promotion or refund terms. Nothing in these Terms removes mandatory statutory rights."),',
        'p("Auction Buyer Fee refund rule. Of the £125 Auction Buyer Fee, only the £100 refundable portion may be returned where CarMazium confirms a genuine qualifying Auction sale failed or was cancelled. The £25 platform-fee portion is non-refundable in all cases, subject to statutory rights that cannot lawfully be excluded. Rejecting unclear Handover Evidence alone does not trigger a refund."),\n            p("Refunds for other CarMazium services depend on the specific service, applicable consumer law, whether the service has begun or been supplied, and any separate service or promotion terms. Nothing in these Terms removes mandatory statutory rights."),',
    ),
    (
        'p("CarMazium may share appropriate contact details between users where reasonably necessary to complete a transaction. Recipients must use such details only for legitimate transaction purposes or otherwise lawfully."),',
        'p("For Retail Listings, Seller contact information may be displayed publicly as part of the Retail service. For Auctions, protected Seller contact details and Auction chat are unlocked to the successful Dealer only after the £125 Auction Buyer Fee has been paid. Recipients must use contact details only for legitimate transaction purposes or otherwise lawfully."),',
    ),
    (
        '''                "Dealer wins — the successful bid determines the Buyer, subject to these Terms.",
                "Dealer contacts Seller — collection and inspection are arranged directly.",''',
        '''                "Dealer wins — the successful bid determines the Buyer, subject to these Terms.",
                "Winning Dealer pays £125 Auction Buyer Fee — £100 is the qualifying failed-sale refundable portion and £25 is the non-refundable platform fee.",
                "Seller details and Auction chat unlock after the fee is confirmed.",
                "Dealer contacts Seller — collection and inspection are arranged directly.",''',
    ),
    (
        'p("The £125 fee is payable to CarMazium. The Vehicle Purchase Price is payable to the Seller."),',
        'p("The £125 fee is payable to CarMazium before protected Seller details/chat unlock. £100 is refundable only if a genuine qualifying Auction sale fails or is cancelled; £25 is the non-refundable platform fee, subject to statutory rights. The Vehicle Purchase Price is payable directly to the Seller after inspection/agreement."),',
    ),
]
for old_text, new_text in replacements:
    if old_text not in text:
        raise SystemExit(f"Terms replacement missing: {old_text[:120]!r}")
    text = text.replace(old_text, new_text, 1)
terms.write_text(text, encoding="utf-8")

# Checkout success: current auction flow; legacy vehicle-money sessions remain historical only.
replace_exact(
    "src/app/checkout/success/page.tsx",
    "                            ? 'Buyer Fee Paid!'",
    "                            ? '£125 Buyer Fee Paid'",
)
replace_exact(
    "src/app/checkout/success/page.tsx",
    "                            ? 'Deposit Confirmed!'\n                            : 'Payment Successful!'",
    "                            ? 'Legacy Deposit Record'\n                            : sessionData?.metadata?.type === 'FULL_PAYMENT'\n                            ? 'Legacy Vehicle Payment Record'\n                            : 'Payment Successful!'",
)
replace_exact(
    "src/app/checkout/success/page.tsx",
    "                            ? 'Your £125 buyer fee is confirmed. Submit your handover proof to release the seller payout.'",
    "                            ? 'Your £125 auction buyer fee is confirmed. Seller details and chat are now unlocked. Arrange inspection and collection, inspect the vehicle, and if you proceed pay the vehicle purchase price directly to the seller. CarMazium has not received the vehicle purchase money.'",
)
replace_exact(
    "src/app/checkout/success/page.tsx",
    '                            ? "Your £500 refundable deposit is confirmed and the seller has been notified. Message them to arrange the rest of the sale — the vehicle price itself is paid directly between you and the seller."\n                            : \'Your transaction has been completed securely through Stripe.\'',
    '                            ? "This is confirmation of a historical deposit session created before CarMazium stopped collecting vehicle deposits. New vehicle deposits and purchase-price payments are made directly between buyer and seller."\n                            : sessionData?.metadata?.type === \'FULL_PAYMENT\'\n                            ? "This is confirmation of a historical vehicle-payment session. CarMazium no longer creates new full vehicle purchase payments; current vehicle sale funds are paid directly to the seller."\n                            : \'Your transaction has been completed securely through Stripe.\'',
)

# Auction emails: no contact before fee; vehicle money remains direct buyer-to-seller.
email = Path("backend/src/email/email.service.ts")
text = email.read_text(encoding="utf-8-sig")
old_won = '''    async sendAuctionWonEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`You won the auction for "${vehicleTitle}" — CarMazium 🏆`, bodyHtml:`<h1 style="color:#fff;">You Won the Auction! 🏆</h1><p style="color:#94a3b8;">Congratulations ${buyerName}. Winning bid: £${winningAmount.toLocaleString('en-GB')}.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/auctions/live/${auctionId}" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Auction →</a></div>` }); }'''
new_won = '''    async sendAuctionWonEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`You won the auction for "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">You Won the Auction</h1><p style="color:#94a3b8;">Congratulations ${buyerName}. Winning bid: £${winningAmount.toLocaleString('en-GB')}.</p><p style="color:#cbd5e1;">Pay the £125 Auction Buyer Fee within 72 hours to unlock the Seller's protected contact details and Auction chat. £100 is refundable only if the genuine qualifying sale fails or is cancelled; the £25 platform fee is non-refundable, subject to statutory rights.</p><p style="color:#cbd5e1;">After the fee is confirmed, arrange inspection and collection. If you proceed, pay the Vehicle Purchase Price directly to the Seller — CarMazium does not receive the Vehicle sale funds.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/dealer/auctions/won" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Complete Buyer Fee →</a></div>` }); }'''
if old_won not in text:
    raise SystemExit("Auction winner email shape changed")
text = text.replace(old_won, new_won, 1)
old_seller = '''    async sendAuctionEndedSellerEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Auction ended — "${vehicleTitle}" sold for £${winningAmount.toLocaleString('en-GB')} — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Your Auction Has Ended</h1><p style="color:#94a3b8;">Hi ${sellerName}, winning bid: £${winningAmount.toLocaleString('en-GB')}.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/auctions" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View My Auctions →</a></div>` }); }'''
new_seller = '''    async sendAuctionEndedSellerEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Auction ended — "${vehicleTitle}" has a winning dealer — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Your Auction Has Ended</h1><p style="color:#94a3b8;">Hi ${sellerName}, the winning bid is £${winningAmount.toLocaleString('en-GB')}.</p><p style="color:#cbd5e1;">The winning Dealer must first pay the £125 Auction Buyer Fee. Your protected contact details and Auction chat remain locked until that fee is confirmed.</p><p style="color:#cbd5e1;">Once contact is unlocked, arrange inspection and collection. The Dealer pays the Vehicle Purchase Price directly to you after inspection/agreement; CarMazium does not receive those Vehicle sale funds.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/auctions" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View My Auctions →</a></div>` }); }'''
if old_seller not in text:
    raise SystemExit("Auction seller email shape changed")
email.write_text(text.replace(old_seller, new_seller, 1), encoding="utf-8")

# Frontend HPI gate and truthful mandatory-HPI copy.
wizard = Path("src/components/listing/ListingWizard.tsx")
text = wizard.read_text(encoding="utf-8-sig")
needle = "                const l = res.data\n                setFormData(prev => ({"
if needle not in text:
    raise SystemExit("ListingWizard edit prefill shape changed")
text = text.replace(needle, "                const l = res.data\n                setIsHpiUnlocked(!!l.hpiReport)\n                setFormData(prev => ({", 1)
old_submit = '''    const handleSubmit = async () => {
        if (!isAuthenticated) { setShowLoginModal(true); return }
        if (!isEmailVerified) { router.push("/auth/onboarding"); return }

        setIsSubmitting(true)'''
new_submit = '''    const handleSubmit = async () => {
        if (!isAuthenticated) { setShowLoginModal(true); return }
        if (!isEmailVerified) { router.push("/auth/onboarding"); return }
        if (!isHpiUnlocked) {
            setSubmitError("A HPI/history report is required for every CarMazium listing. Request the report before submitting your vehicle for review.")
            setShowHpiModal(true)
            return
        }

        setIsSubmitting(true)'''
if old_submit not in text:
    raise SystemExit("ListingWizard submit shape changed")
text = text.replace(old_submit, new_submit, 1)
text = text.replace("Official HPI Vehicle Check", "Mandatory HPI Vehicle Check", 1)
text = text.replace(
    "We've found an official HPI record for this vehicle. Unlocking the full report gives you a <strong className=\"text-[var(--text-primary)]\">Premium Verification Badge</strong> on your listing.",
    "Every CarMazium listing requires a vehicle history report. Request it here before final submission; the report may remain pending while our team prepares it.",
    1,
)
text = text.replace("Unlock Full HPI Report", "Request Mandatory HPI Report", 1)
wizard.write_text(text, encoding="utf-8")

# Backend HPI invariant and fresh-HPI requirement for retail relists.
listings = Path("backend/src/listings/listings.service.ts")
text = listings.read_text(encoding="utf-8-sig")
photo_guard = '''        if (listing.images.length < 10) {
            throw new BadRequestException(
                `Listings require at least 10 photos before publishing. You have ${listing.images.length}.`,
            );
        }

        // Already active — nothing to do'''
hpi_guard = '''        if (listing.images.length < 10) {
            throw new BadRequestException(
                `Listings require at least 10 photos before publishing. You have ${listing.images.length}.`,
            );
        }

        const mandatoryHpi = await this.prisma.hpiReport.findUnique({
            where: { listingId: id },
            select: { id: true, status: true },
        });
        if (!mandatoryHpi) {
            throw new BadRequestException(
                'A HPI/history report request is required before this listing can be submitted for review.',
            );
        }

        // Already active — nothing to do'''
if photo_guard not in text:
    raise SystemExit("publishListing photo guard shape changed")
text = text.replace(photo_guard, hpi_guard, 1)
transition = '''        if (status === 'ACTIVE' && !['ACTIVE', 'SOLD', 'WITHDRAWN', 'OFFER_ACCEPTED'].includes(listing.status)) {
            throw new BadRequestException(
                'This listing has not been approved yet. Submit it for review from the listing editor instead.',
            );
        }

        // For SOLD transitions'''
transition_new = '''        if (status === 'ACTIVE' && !['ACTIVE', 'SOLD', 'WITHDRAWN', 'OFFER_ACCEPTED'].includes(listing.status)) {
            throw new BadRequestException(
                'This listing has not been approved yet. Submit it for review from the listing editor instead.',
            );
        }
        if (status === 'ACTIVE' && listing.type === 'CLASSIFIED' && ['SOLD', 'WITHDRAWN', 'OFFER_ACCEPTED'].includes(listing.status)) {
            throw new BadRequestException(
                'Retail relisting requires a new Retail Listing and a fresh HPI/history report. Create a new listing instead of reactivating this one.',
            );
        }

        // For SOLD transitions'''
if transition not in text:
    raise SystemExit("updateStatus transition shape changed")
listings.write_text(text.replace(transition, transition_new, 1), encoding="utf-8")

# Admin approval requires an HPI row, but PENDING status is acceptable.
admin = Path("backend/src/admin/admin.service.ts")
text = admin.read_text(encoding="utf-8-sig")
text = text.replace(
    '// Drives the "HPI outstanding" indicator. Informational only —\n                // a pending report no longer blocks approval, it just tells the\n                // reviewer this listing will go live owing its seller a report.',
    '// HPI is mandatory: the relation must exist before approval. A PENDING\n                // report does not block approval; it tells the reviewer the report\n                // is still being prepared and will be attached later.',
    1,
)
approve_marker = "    async approveListing(id: string) {"
pos = text.find(approve_marker)
if pos < 0:
    raise SystemExit("approveListing not found")
before, after = text[:pos], text[pos:]
old_find = "        const listing = await this.prisma.listing.findUnique({ where: { id } });\n        if (!listing) {\n            throw new NotFoundException('Listing not found');\n        }\n        if (listing.status !== 'PENDING_REVIEW') {"
new_find = "        const listing = await this.prisma.listing.findUnique({\n            where: { id },\n            include: { hpiReport: { select: { id: true, status: true } } },\n        });\n        if (!listing) {\n            throw new NotFoundException('Listing not found');\n        }\n        if (!listing.hpiReport) {\n            throw new BadRequestException('Every listing requires a HPI/history report request before it can be approved.');\n        }\n        if (listing.status !== 'PENDING_REVIEW') {"
if old_find not in after:
    raise SystemExit("approveListing lookup shape changed")
after = after.replace(old_find, new_find, 1)
admin.write_text(before + after, encoding="utf-8")

# Canonical auction duration is 24 hours in docs as well as implementation.
replace_exact(
    "backend/src/auctions/auctions.controller.ts",
    "@ApiResponse({ status: 201, description: 'Auction created. endTime = startTime + 5 hours.' })",
    "@ApiResponse({ status: 201, description: 'Auction created. endTime = startTime + 24 hours.' })",
)

# Deployment metadata points to the owned production repository. No schema push.
Path("render.yaml").write_text(
    """services:\n  - type: web\n    name: carmazium-backend\n    runtime: docker\n    repo: https://github.com/carmazium/Carmazium-Trade\n    branch: main\n    dockerfilePath: ./backend/Dockerfile\n    dockerContext: ./backend\n    healthCheckPath: /api/health\n    autoDeployTrigger: commit\n""",
    encoding="utf-8",
)

# Public frontend env example uses placeholders only and documents WebSocket URL.
Path(".env.example").write_text(
    """# CarMazium frontend environment template\n# Copy to .env.local for local development. NEXT_PUBLIC_* values are public.\n\n# Application / backend\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nNEXT_PUBLIC_API_URL=http://localhost:8080/api\nNEXT_PUBLIC_WS_URL=http://localhost:8080\n\n# Supabase public client configuration\nNEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=\n\n# Search-engine ownership verification\nNEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=\n\n# Analytics / advertising (optional)\nNEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX\nNEXT_PUBLIC_GTM_ID=GTM-XXXXXXX\nNEXT_PUBLIC_META_PIXEL_ID=\nNEXT_PUBLIC_TIKTOK_PIXEL_ID=\nNEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXXX\nNEXT_PUBLIC_GADS_LABEL_PURCHASE=\nNEXT_PUBLIC_GADS_LABEL_LISTING_SUBMITTED=\nNEXT_PUBLIC_GADS_LABEL_VALUATION=\n""",
    encoding="utf-8",
)
