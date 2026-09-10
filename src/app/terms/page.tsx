import { Scale, Info, AlertTriangle, ShieldAlert, Mail, Phone, MapPin } from "lucide-react"

export const metadata = {
    title: 'Terms & Conditions',
    description: 'Terms and Conditions for using the CarMazium platform.',
}

// ─── Content model ──────────────────────────────────────────────────────────
// The source document (CarMazium Ltd, company no. 17053307, "Last Updated:
// 13 August 2026") is 83 numbered sections. Each is rendered as its own
// numbered card, matching the section numbering of the source 1:1 so nothing
// gets renumbered, merged, or reworded out of step with the legal text.

type Block =
    | { type: "p"; text: string }
    | { type: "ul"; items: string[] }
    | { type: "dl"; items: { term: string; def: string }[] }
    | { type: "callout"; tone: "info" | "warn" | "danger"; text: string }
    | { type: "steps"; items: string[] }
    | { type: "money"; title: string; lines: string[] }

type LegalSection = { num: number; title: string; blocks: Block[] }

const p = (text: string): Block => ({ type: "p", text })
const ul = (items: string[]): Block => ({ type: "ul", items })
const callout = (tone: "info" | "warn" | "danger", text: string): Block => ({ type: "callout", tone, text })

const SECTIONS: LegalSection[] = [
    {
        num: 1,
        title: "Definitions",
        blocks: [
            { type: "dl", items: [
                { term: "Account", def: "A registered user account on the Platform." },
                { term: "Auction", def: "A timed vehicle auction operated through the Platform." },
                { term: "Auction Buyer", def: "An approved motor trader or Dealer who bids for and purchases a Vehicle through an Auction." },
                { term: "Auction Listing", def: "A Vehicle submitted for sale through the CarMazium Auction service." },
                { term: "Buyer", def: "Any person or business seeking to purchase a Vehicle." },
                { term: "Consumer", def: "An individual acting wholly or mainly outside their trade, business, craft or profession." },
                { term: "Dealer", def: "A motor trader, dealership, vehicle-buying business or other commercial motor-trade buyer approved by CarMazium." },
                { term: "Dealer Fee / Auction Buyer Fee", def: "The fee payable to CarMazium by a successful Auction Buyer, currently £125 unless another amount is displayed before bidding." },
                { term: "Handover", def: "The physical transfer of the Vehicle, keys and applicable documentation from the Seller to the successful Buyer or Dealer after payment has been received." },
                { term: "Handover Evidence", def: "Photographic, electronic or other reasonable evidence requested by CarMazium to verify that a transaction and vehicle handover have successfully taken place." },
                { term: "Listing", def: "An Auction Listing or Retail Listing." },
                { term: "Mazium AI", def: "Any artificial-intelligence search, recommendation, valuation, categorisation, description or other AI-assisted feature offered through CarMazium." },
                { term: "Purchase Price", def: "The agreed price payable by the Buyer or Dealer directly to the Seller for the Vehicle." },
                { term: "Qualifying Auction Sale", def: "A genuine Vehicle sale completed through the CarMazium Auction service that satisfies the eligibility requirements for the Seller Incentive." },
                { term: "Reserve Price", def: "Any minimum price agreed or selected for an Auction where applicable." },
                { term: "Retail Buyer", def: "A Buyer purchasing or seeking to purchase a Vehicle advertised through a Retail Listing." },
                { term: "Retail Listing", def: "An advertisement through which the Seller markets a Vehicle for direct sale to a Buyer outside the Auction process." },
                { term: "Retail Listing Fee", def: "The fee charged by CarMazium to publish a Retail Listing, currently £1 unless another price is clearly displayed before purchase." },
                { term: "Seller", def: "The legal owner of the Vehicle or a person properly authorised by the legal owner to sell it." },
                { term: "Seller Incentive / £100 Seller Incentive", def: "The promotional payment offered by CarMazium to an eligible Seller after a Qualifying Auction Sale and approved Handover." },
                { term: "Successful Auction Buyer", def: "The Dealer whose valid winning bid results in the purchase of a Vehicle." },
                { term: "Vehicle", def: "Any motor vehicle listed, advertised, bid upon, purchased or sold through or following use of the Platform." },
                { term: "Vehicle Sale Contract", def: "The contract for sale and purchase of the Vehicle directly between the Seller and the Buyer or Dealer." },
            ] },
        ],
    },
    {
        num: 2,
        title: "CarMazium's Role",
        blocks: [
            p("Marketplace only. CarMazium is an online marketplace and technology platform. Unless expressly stated otherwise, CarMazium:"),
            ul([
                "does not own Vehicles listed on the Platform",
                "does not purchase Vehicles from Sellers",
                "does not sell Vehicles as principal",
                "does not become the owner of a Vehicle",
                "does not take title to a Vehicle",
                "does not ordinarily take physical possession of a Vehicle",
                "does not act as the Seller's agent for receiving the Vehicle Purchase Price",
                "does not act as the Buyer's agent for paying the Vehicle Purchase Price",
                "does not provide escrow for Vehicle Purchase Prices",
                "is not a party to the Vehicle Sale Contract between Seller and Buyer",
            ]),
            p("Purchase payments never pass through CarMazium. CarMazium does not process, receive, hold, safeguard, transfer or otherwise handle the purchase price of a Vehicle. All Vehicle Purchase Price payments are made directly between the Buyer or Dealer and the Seller. CarMazium only handles its own Platform-related charges and incentives, including the Auction Buyer Fee, the Retail Listing Fee, and the Seller Incentive."),
            p("Separate contracts. When a Vehicle is sold, the Vehicle Sale Contract exists directly between Seller and Buyer/Dealer. Any separate Platform fee agreement exists between CarMazium and the relevant Platform user. The fact that CarMazium operates the Platform, hosts the Auction, provides contact information, verifies users or provides a Seller Incentive does not make CarMazium a party to the Vehicle Sale Contract."),
        ],
    },
    {
        num: 3,
        title: "CarMazium Services",
        blocks: [
            p("CarMazium may provide:"),
            ul([
                "free Auction Listings for eligible Sellers",
                "24-hour Auctions",
                "Dealer bidding",
                "£1 Retail Listings",
                "vehicle search and discovery",
                "Mazium AI search",
                "valuation tools",
                "Dealer stock sourcing",
                "vehicle listing tools",
                "communication facilities",
                "transaction administration",
                "Handover verification",
                "Seller Incentives",
                "other services introduced from time to time",
            ]),
            p("Features may be added, removed or modified where reasonably necessary."),
        ],
    },
    {
        num: 4,
        title: "Account Eligibility",
        blocks: [
            p("Minimum age. You must be at least 18 years old and legally capable of entering into contracts."),
            p("Business authority. Anyone opening or using an Account on behalf of a business confirms that they are authorised to act for and bind that business."),
            p("Accurate information. You must provide accurate and current information. You must not:"),
            ul([
                "impersonate another person or business",
                "use false contact details",
                "misrepresent whether you are a private Seller or Dealer",
                "create Accounts to evade restrictions",
                "create multiple Accounts to manipulate promotions or Auctions",
                "allow unauthorised persons to use your Account",
                "use another person's Account without permission",
            ]),
            p("Security. You are responsible for maintaining the confidentiality of your login credentials. You must notify CarMazium promptly if you suspect unauthorised use."),
        ],
    },
    {
        num: 5,
        title: "Identity and Dealer Verification",
        blocks: [
            p("CarMazium may require users to provide information or documents to verify identity, address, business status, Dealer status, company registration, motor-trade activity, Vehicle ownership, authority to sell, contact details, or other information relevant to fraud prevention or Platform security."),
            p("CarMazium may use third-party verification providers. Verification reduces risk but does not guarantee that a user will act honestly, complete a transaction or remain financially solvent."),
        ],
    },
    {
        num: 6,
        title: "Seller Authority to Sell",
        blocks: [
            p("A Seller confirms and warrants that:"),
            ul([
                "they legally own the Vehicle or are properly authorised by the owner",
                "they are entitled to sell and transfer the Vehicle",
                "the Vehicle is not stolen",
                "the Vehicle is not cloned",
                "they have disclosed any finance or third-party interest",
                "they will not knowingly misrepresent title",
                "they will cooperate with lawful checks reasonably required to verify ownership",
            ]),
            p("Where finance remains outstanding, the Seller must disclose it."),
        ],
    },
    {
        num: 7,
        title: "Vehicle Information",
        blocks: [
            p("The Seller must provide information honestly and accurately to the best of their knowledge. This may include:"),
            ul([
                "registration number, VIN where requested, make, model, derivative, year, mileage",
                "engine, fuel type, transmission, specification, number of keys",
                "MOT status, service history, warning lights, mechanical condition",
                "body damage, accident history, insurance category/write-off status",
                "modifications, missing equipment, outstanding finance, electrical faults",
                "tyre condition, interior condition, and any other material information requested",
            ]),
            p("The Seller must not deliberately conceal defects or provide misleading photographs."),
        ],
    },
    {
        num: 8,
        title: "Vehicle Photographs",
        blocks: [
            p("Photographs must fairly represent the Vehicle. Sellers must not:"),
            ul([
                "digitally remove defects",
                "materially alter Vehicle condition",
                "use photographs of another Vehicle",
                "conceal substantial damage through editing",
                "deliberately omit requested photographs intended to show condition",
            ]),
            p("CarMazium may request further photographs or video."),
        ],
    },
    {
        num: 9,
        title: "Vehicle Mileage",
        blocks: [
            p("The Seller must provide the Vehicle's mileage honestly. If the Seller knows or suspects that the odometer reading is inaccurate, replaced or inconsistent with the Vehicle's actual mileage, this must be disclosed."),
        ],
    },
    {
        num: 10,
        title: "Valuations",
        blocks: [
            p("Any valuation produced through CarMazium or Mazium AI is an estimate only. A valuation:"),
            ul([
                "is not an offer by CarMazium to buy the Vehicle",
                "is not a guaranteed sale price",
                "is not a guaranteed Auction result",
                "does not guarantee the Reserve Price will be met",
                "does not constitute a mechanical inspection",
                "may change based on Vehicle condition, history, mileage, market demand, location, specification or Dealer appetite",
            ]),
        ],
    },
    {
        num: 11,
        title: "Free Auction Listing",
        blocks: [
            p("Eligible Sellers may list a Vehicle through the CarMazium Auction service free of charge — the Seller Auction Listing Fee is £0. There is no Auction listing charge to the Seller unless a separate optional paid service is clearly selected and accepted. The free Auction service is separate from the £1 Retail Listing service."),
        ],
    },
    {
        num: 12,
        title: "Retail Listings",
        blocks: [
            p("Retail Listing Fee. CarMazium may allow Sellers to advertise Vehicles directly to retail Buyers. The current Retail Listing Fee is £1 per Retail Listing, unless a different fee is prominently displayed before the Seller purchases the Listing."),
            p("A Retail Listing is a separate service from the Auction service. A Retail Seller communicates and transacts directly with prospective Buyers."),
            p("No Buyer Fee on Retail Listings — where a Vehicle is purchased through a Retail Listing, the Retail Buyer pays no £125 CarMazium Auction Buyer Fee."),
            p("No automatic £100 Seller Incentive — a Retail Listing sale is not eligible for the £100 Auction Seller Incentive unless CarMazium expressly advertises a separate promotion stating otherwise."),
        ],
    },
    {
        num: 13,
        title: "Retail Transactions",
        blocks: [
            p("The Retail Buyer and Seller are responsible for agreeing Purchase Price, payment method, inspection, collection, delivery, documentation, Vehicle transfer and any other terms of their Vehicle Sale Contract. CarMazium does not handle the Vehicle Purchase Price."),
        ],
    },
    {
        num: 14,
        title: "Auction Submission",
        blocks: [
            p("When a Seller submits a Vehicle to Auction, the Seller authorises CarMazium to make the Listing information available to eligible Dealers. CarMazium may decline, suspend or remove an Auction Listing where reasonably necessary, including for:"),
            ul([
                "suspected fraud", "inaccurate information", "duplicated Vehicles", "ownership concerns",
                "technical problems", "security", "legal compliance", "Auction manipulation", "breach of these Terms",
            ]),
        ],
    },
    {
        num: 15,
        title: "Auction Duration",
        blocks: [
            p("An Auction will ordinarily operate for the period shown on the Platform. CarMazium may reasonably pause, extend, restart or cancel an Auction where necessary because of:"),
            ul([
                "technical failure", "suspected fraudulent bidding", "system outages", "material Listing error",
                "security issues", "duplicate Vehicle listings", "manipulation", "legal requirements",
                "circumstances beyond reasonable control",
            ]),
        ],
    },
    {
        num: 16,
        title: "Reserve Prices",
        blocks: [
            p("Where the Platform permits a Reserve Price, the Seller may set or agree a minimum acceptable Auction price. If the Reserve is not met, the Seller is not automatically required to sell. CarMazium may facilitate further negotiation after the Auction."),
        ],
    },
    {
        num: 17,
        title: "Dealer Bidding Eligibility",
        blocks: [
            p("Only Dealers authorised by CarMazium may bid in trade Auctions. By bidding, the Dealer confirms that:"),
            ul([
                "it is acting in the course of business",
                "the bidder has authority to bind the Dealer",
                "it has reviewed available Vehicle information",
                "it intends genuinely to purchase if successful",
                "it has sufficient financial capacity to complete",
                "the bid is genuine",
            ]),
        ],
    },
    {
        num: 18,
        title: "Prohibited Bidding",
        blocks: [
            p("Dealers must not:"),
            ul([
                "submit sham bids", "artificially inflate prices", "collude with another bidder",
                "manipulate bidding", "bid through multiple related Accounts",
                "deliberately win without intending to purchase", "attempt to suppress competing bids",
                "use unauthorised bidding automation", "intimidate another bidder",
            ]),
            p("CarMazium may invalidate suspicious bids and take Account action."),
        ],
    },
    {
        num: 19,
        title: "Auction Contract Formation",
        blocks: [
            p("Where (1) an Auction closes, (2) a valid highest bid exists, (3) the bid meets any applicable Reserve Price, and (4) the transaction has not been cancelled under an applicable Platform rule, the winning bid constitutes the Successful Auction Buyer's agreement to purchase the Vehicle subject to these Terms and the Vehicle being materially as described."),
            p("The Vehicle Sale Contract is between the Seller and the Successful Auction Buyer. CarMazium is not a party to that Vehicle Sale Contract."),
        ],
    },
    {
        num: 20,
        title: "£125 Auction Buyer Fee",
        blocks: [
            p("Fee. Where a Vehicle is successfully purchased through a CarMazium Auction, the Successful Auction Buyer must pay CarMazium the applicable Auction Buyer Fee. The current fee is £125 per successfully purchased Auction Vehicle, unless another amount is clearly displayed before the Dealer bids."),
            p("Separate from Purchase Price. The £125 fee is payable to CarMazium. The Vehicle Purchase Price is payable directly to the Seller. These are completely separate payments."),
            p("Retail exemption. The £125 Auction Buyer Fee does not apply to Vehicles purchased through Retail Listings."),
            p("Failed-sale refund. If CarMazium verifies before Handover that the Auction Vehicle materially differs from its listing because of an undisclosed fault or other material undisclosed condition, CarMazium may cancel the failed Auction sale and refund the Successful Auction Buyer’s £125 Auction Buyer Fee in full. A rejected or unclear Handover Evidence submission by itself is not a failed-sale event and does not trigger a Buyer Fee refund."),
            p("VAT. Where VAT is legally chargeable on a CarMazium fee, the Platform or invoice will state the applicable VAT treatment."),
        ],
    },
    {
        num: 21,
        title: "Winning Dealer Contact",
        blocks: [
            p("After a successful Auction, CarMazium may provide the parties with the contact information necessary to complete the transaction. The successful Dealer must make reasonable efforts to contact the Seller promptly. Seller and Dealer should cooperate in arranging collection and inspection."),
        ],
    },
    {
        num: 22,
        title: "Collection",
        blocks: [
            p("Unless otherwise agreed directly between Seller and Dealer, the Successful Auction Buyer is responsible for arranging Vehicle collection. A transport or collection provider arranged by a Dealer acts for that Dealer unless CarMazium expressly states otherwise."),
        ],
    },
    {
        num: 23,
        title: "Dealer Inspection",
        blocks: [
            p("Before completing the Vehicle purchase, the Dealer may inspect the Vehicle to confirm that it materially matches the Listing. The Dealer may inspect matters including:"),
            ul([
                "Vehicle identity, mileage, warning lights", "body condition, interior condition, obvious mechanical condition",
                "keys, service records, specification, documentation, disclosed defects",
            ]),
        ],
    },
    {
        num: 24,
        title: "Material Discrepancies",
        blocks: [
            p("A Material Discrepancy means an undisclosed or materially inaccurate matter that would reasonably have a significant effect on value, condition, identity, desirability, legality, or safety. Examples may include:"),
            ul([
                "substantial undisclosed accident damage", "materially incorrect mileage",
                "major undisclosed mechanical failure", "incorrect derivative",
                "undisclosed insurance write-off/category", "undisclosed finance",
                "significant missing equipment", "substantial undisclosed body damage",
                "materially incorrect Vehicle specification",
            ]),
            p("Normal age-related wear, minor imperfections and defects clearly disclosed or visible in photographs should not ordinarily justify a post-Auction price reduction."),
        ],
    },
    {
        num: 25,
        title: "Post-Auction Price Renegotiation",
        blocks: [
            p("Dealers must not deliberately bid high with the intention of forcing an unjustified price reduction at collection. If a Material Discrepancy is discovered, the Dealer should explain the discrepancy and provide reasonable evidence where practical."),
            p("Seller and Dealer may agree to continue at the Auction price, to agree a revised price, or not to proceed where the discrepancy is sufficiently material. CarMazium may investigate repeated complaints concerning unreasonable post-Auction reductions."),
        ],
    },
    {
        num: 26,
        title: "Vehicle Purchase Payment",
        blocks: [
            p("Direct payment only. The Buyer or Dealer pays the Seller directly. CarMazium does not receive or process the Vehicle Purchase Price."),
            p("Seller responsibility. The Seller must independently confirm that the full agreed Purchase Price has arrived as cleared funds in their own bank account."),
            p("Do not rely on screenshots. The Seller must not release the Vehicle solely because they have seen a payment screenshot, a pending payment screen, a banking notification, a text message, an email, or another person's statement that payment has been made. The Seller should verify cleared funds independently."),
        ],
    },
    {
        num: 27,
        title: "CarMazium Is Not a Payment Service for the Vehicle Sale",
        blocks: [
            p("CarMazium does not collect the Vehicle Purchase Price, hold the Vehicle Purchase Price, transfer it to the Seller, operate Vehicle-price escrow, guarantee Buyer funds, guarantee bank transfers, or take responsibility for a Buyer's payment merely because the Buyer uses the Platform."),
        ],
    },
    {
        num: 28,
        title: "Handover",
        blocks: [
            p("Once the Seller has confirmed cleared payment, the Seller may complete Handover. Handover may include the Vehicle, keys, service documentation, manuals, relevant receipts, appropriate V5C/trade information, and other agreed Vehicle documentation."),
        ],
    },
    {
        num: 29,
        title: "Vehicle Transfer",
        blocks: [
            p("Seller and Buyer/Dealer remain responsible for complying with applicable DVLA and legal requirements relating to the transfer of the Vehicle. Where transferred into the motor trade, the Dealer should follow the applicable motor-trade transfer process. The parties should not deliberately leave Vehicle records inaccurate."),
        ],
    },
    {
        num: 30,
        title: "Handover Evidence",
        blocks: [
            p("CarMazium may require evidence that the Auction transaction has completed. This may include a Handover photograph, Seller confirmation, Dealer confirmation, collection photograph, Vehicle transfer confirmation, payment confirmation with sensitive details redacted, or other reasonable evidence. Users must not fabricate Handover Evidence."),
        ],
    },
    {
        num: 31,
        title: "£100 Auction Seller Incentive",
        blocks: [
            p("Nature of incentive. Where advertised, CarMazium may pay an eligible Seller £100 after completion and approval of a Qualifying Auction Sale. This £100 is paid by CarMazium, separate from the Vehicle Purchase Price, separate from Dealer payment, a promotional Platform incentive, and available only for qualifying Auction sales."),
            p("Not part of Vehicle payment. If a Vehicle sells for £10,000: the Dealer pays the Seller £10,000 Purchase Price; the Dealer pays CarMazium a £125 Auction Buyer Fee; CarMazium pays the eligible Seller a £100 Seller Incentive after approved Handover. CarMazium does not handle the £10,000 Vehicle Purchase Price."),
        ],
    },
    {
        num: 32,
        title: "Seller Incentive Eligibility",
        blocks: [
            p("Unless different promotion-specific terms are displayed, eligibility requires:"),
            ul([
                "a genuine Auction Listing", "a genuine Successful Auction Buyer", "completion of the Auction sale",
                "Buyer payment made directly to Seller", "Seller confirmation of cleared funds",
                "completed Vehicle Handover", "appropriate Vehicle/trade transfer",
                "satisfactory Handover Evidence", "CarMazium verification and approval",
                "no fraud, collusion or promotion abuse",
            ]),
        ],
    },
    {
        num: 33,
        title: "When the £100 Is Payable",
        blocks: [
            p("The Seller Incentive becomes payable only after CarMazium has reasonably verified the completed Handover. The Seller does not earn the incentive merely because the Vehicle was listed, an Auction started, bids were placed, a reserve was reached, a Buyer was identified, or the Auction ended. Completion and approved Handover are required."),
        ],
    },
    {
        num: 34,
        title: "One Incentive per Vehicle Transaction",
        blocks: [
            p("Unless another promotion expressly states otherwise, only one Seller Incentive may be claimed per qualifying Vehicle transaction."),
        ],
    },
    {
        num: 35,
        title: "Incentive Fraud and Abuse",
        blocks: [
            p("CarMazium may refuse or recover a Seller Incentive where there is reasonable evidence of:"),
            ul([
                "fabricated sale", "fake Handover", "collusion between Buyer and Seller",
                "repeated duplicate claims", "multiple Accounts used to obtain duplicate rewards",
                "payment reversal", "transaction cancellation", "falsified Handover photograph",
                "sham transaction", "use of related parties solely to obtain the reward",
                "another material abuse of the promotion",
            ]),
            p("Where appropriate, CarMazium may ask the Seller for further evidence before deciding a disputed claim."),
        ],
    },
    {
        num: 36,
        title: "Incentive Promotional Conditions",
        blocks: [
            p("CarMazium may specify additional eligibility criteria for particular promotions. Any significant promotional conditions should be communicated prominently in the relevant marketing or offer."),
        ],
    },
    {
        num: 37,
        title: "Dealer Obligations",
        blocks: [
            p("Dealers must:"),
            ul([
                "act professionally", "communicate honestly", "arrange collection reasonably",
                "inspect Vehicles fairly", "pay Sellers directly", "avoid misleading payment claims",
                "comply with motor-trade legal obligations",
                "use Seller information only for legitimate transaction purposes",
                "complete appropriate trade transfer processes", "pay CarMazium fees when due",
            ]),
        ],
    },
    {
        num: 38,
        title: "Dealer Misconduct",
        blocks: [
            p("Dealers must not:"),
            ul([
                "pressure Sellers unfairly", "invent defects", "manipulate condition reports",
                "falsely state that CarMazium authorised a lower price", "misrepresent payment status",
                "repeatedly fail to collect Vehicles without legitimate reason", "misuse personal information",
                "circumvent Auctions to avoid valid Platform fees", "manipulate bidding",
                "harass Sellers", "engage in illegal conduct",
            ]),
        ],
    },
    {
        num: 39,
        title: "Seller Withdrawal",
        blocks: [
            p("Before a binding sale arises, a Seller may withdraw a Vehicle subject to any Auction rules displayed at the time. Once a binding sale has arisen, the Seller should not refuse to complete solely because they changed their mind, they received a higher outside offer, or they no longer wish to sell without legitimate reason. Repeated misuse may result in Account restrictions."),
        ],
    },
    {
        num: 40,
        title: "Dealer Failure to Complete",
        blocks: [
            p("A Successful Auction Buyer should complete the purchase unless a legitimate reason exists under these Terms, including a Material Discrepancy. Repeated unjustified failure to complete may result in:"),
            ul([
                "warning", "suspension", "loss of bidding privileges", "Account termination",
                "recovery of properly due Platform fees", "other proportionate enforcement action",
            ]),
        ],
    },
    {
        num: 41,
        title: "User-to-User Disputes",
        blocks: [
            p("The Seller and Buyer are responsible for resolving disputes under their Vehicle Sale Contract. CarMazium may voluntarily facilitate communication, provide relevant Platform records, investigate user conduct, review Handover Evidence, or enforce Platform rules. CarMazium does not become an arbitrator or party to the Vehicle Sale Contract by providing assistance."),
        ],
    },
    {
        num: 42,
        title: "Private Buyers and Dealer Sellers",
        blocks: [
            p("Where a Consumer purchases a Vehicle from a motor trader, statutory consumer rights may apply independently of these Terms. A Dealer must not misrepresent itself as a private Seller to avoid legal obligations. Nothing in these Terms removes rights that cannot lawfully be excluded."),
        ],
    },
    {
        num: 43,
        title: "Retail Buyer Responsibility",
        blocks: [
            p("Retail Buyers should consider appropriate checks before purchasing, including Vehicle condition, MOT, mileage, history, documentation, finance, title, inspection, and Seller identity. Where appropriate, Buyers should obtain independent professional advice or inspection."),
        ],
    },
    {
        num: 44,
        title: "Vehicle History Data",
        blocks: [
            p("Mandatory pre-publication review. Each Listing must complete CarMazium's vehicle-history/HPI review before it can be approved and made live. This review is part of the Listing review workflow and is not a separate Seller HPI add-on charge."),
            p("Auction reuse and Retail freshness. Where the same Vehicle is relisted through an Auction, CarMazium may reuse a previously completed report where it remains appropriate, together with updated Seller notes or review information. A Retail relist requires a fresh vehicle-history review before republication."),
            p("CarMazium may display information obtained from third-party providers, such as MOT information, Vehicle specification, finance indicators, valuation data, insurance category, and history information. Third-party data may contain errors or delays. CarMazium does not warrant that third-party databases are complete or error-free."),
        ],
    },
    {
        num: 45,
        title: "Verified Users",
        blocks: [
            p("References to \"verified\" Dealers or Sellers mean that CarMazium has carried out the verification process it considers appropriate for that Account. Verification does not mean that CarMazium guarantees honesty, creditworthiness, Vehicle condition, payment, future conduct, or Vehicle ownership beyond checks performed."),
        ],
    },
    {
        num: 46,
        title: "Mazium AI",
        blocks: [
            p("Mazium AI may assist with car searches, vehicle recommendations, valuations, Listing descriptions, filters, categorisation, comparison, and user navigation. AI-generated information can be inaccurate or incomplete. Users should independently verify important information. Mazium AI does not provide legal, tax, financial, mechanical or professional advice."),
        ],
    },
    {
        num: 47,
        title: "User Content",
        blocks: [
            p("Users retain ownership of content they lawfully own. By uploading Vehicle photographs, descriptions or other materials, users grant CarMazium a non-exclusive, worldwide, royalty-free licence to use that content as reasonably necessary to:"),
            ul([
                "publish the Listing", "operate the Platform", "market the Vehicle", "provide user support",
                "investigate fraud", "enforce these Terms",
                "promote CarMazium where reasonably connected to the Listing",
            ]),
        ],
    },
    {
        num: 48,
        title: "Content Warranties",
        blocks: [
            p("Users warrant that uploaded content belongs to them or they have permission to use it, does not infringe third-party rights, is not deliberately misleading, is not unlawful, and does not contain malicious code."),
        ],
    },
    {
        num: 49,
        title: "CarMazium Intellectual Property",
        blocks: [
            p("CarMazium's brand, logo, website, software, databases, original graphics, interface, text, Platform design and proprietary technology belong to CarMazium or its licensors. Users may not commercially copy or republish them without permission."),
        ],
    },
    {
        num: 50,
        title: "Scraping and Automation",
        blocks: [
            p("Users must not, without written permission:"),
            ul([
                "systematically scrape Vehicle listings", "harvest user data", "extract CarMazium databases",
                "use bots that interfere with the Platform", "bypass technical restrictions",
                "reverse engineer protected systems", "overload Platform infrastructure",
            ]),
        ],
    },
    {
        num: 51,
        title: "Prohibited Activity",
        blocks: [
            p("The Platform must not be used for:"),
            ul([
                "fraud", "money laundering", "stolen Vehicles", "Vehicle cloning", "mileage manipulation",
                "false documents", "Auction manipulation", "fraudulent reward claims",
                "unlawful data collection", "malicious software", "harassment", "impersonation",
                "sanctions violations", "other unlawful activity",
            ]),
        ],
    },
    {
        num: 52,
        title: "Anti-Circumvention",
        blocks: [
            p("Users must not deliberately use an introduction made through CarMazium to avoid a legitimately due CarMazium Auction Buyer Fee. This clause does not prevent Seller and Dealer from communicating directly where direct communication is part of the normal CarMazium completion process."),
        ],
    },
    {
        num: 53,
        title: "Platform Availability",
        blocks: [
            p("CarMazium aims to provide a reliable Platform but cannot guarantee uninterrupted operation. Services may be temporarily unavailable because of maintenance, infrastructure failure, third-party outage, cyber incident, telecommunications failure, force majeure, or other events beyond reasonable control."),
        ],
    },
    {
        num: 54,
        title: "Account Suspension",
        blocks: [
            p("CarMazium may reasonably suspend or restrict an Account where there is evidence or reasonable suspicion of:"),
            ul([
                "fraud", "Auction manipulation", "serious misconduct", "identity concerns", "abuse",
                "repeated non-completion", "unpaid Platform fees", "security risks", "legal violations",
                "breach of these Terms",
            ]),
        ],
    },
    {
        num: 55,
        title: "Account Termination",
        blocks: [
            p("CarMazium may terminate Accounts for serious or repeated breaches. Where reasonably appropriate and legally permissible, CarMazium will communicate the reason. Termination does not cancel completed transactions, existing Vehicle Sale Contracts, outstanding Platform fees, accrued rights, or obligations intended to survive termination."),
        ],
    },
    {
        num: 56,
        title: "Fees and Price Changes",
        blocks: [
            p("CarMazium may change future Platform fees. A new fee does not retrospectively alter a transaction already agreed. The applicable fee should be displayed before a user becomes liable to pay it. Current principal fees are:"),
            ul([
                "Auction Seller Listing Fee: £0",
                "Auction Buyer Fee: £125",
                "Retail Listing Fee: £1",
                "Retail Buyer Fee: £0",
                "Eligible Auction Seller Incentive: £100 after approved successful Handover",
            ]),
        ],
    },
    {
        num: 57,
        title: "Optional Paid Services",
        blocks: [
            p("Any optional service that carries an additional charge must be clearly identified. Users will not be charged for optional extras without appropriate agreement."),
        ],
    },
    {
        num: 58,
        title: "Refunds of Platform Fees",
        blocks: [
            p("Any entitlement to refund of a CarMazium Platform fee will depend on applicable consumer law, whether the service has begun or been supplied, the reason for cancellation, the specific service purchased, and any separate promotion or refund terms. Nothing in these Terms removes mandatory statutory rights."),
        ],
    },
    {
        num: 59,
        title: "Consumer Cancellation Rights",
        blocks: [
            p("Where applicable law provides a Consumer with cancellation rights in relation to a CarMazium service, those rights remain unaffected. Where a Consumer requests that a paid service begins during any statutory cancellation period, CarMazium may request the acknowledgements or consent required by law."),
        ],
    },
    {
        num: 60,
        title: "Tax and Accounting",
        blocks: [
            p("Users remain responsible for their own tax, VAT, accounting, business records, profit calculations, and motor-trade compliance. CarMazium does not provide tax advice."),
        ],
    },
    {
        num: 61,
        title: "Data Protection",
        blocks: [
            p("CarMazium processes personal data in accordance with its Privacy Policy and applicable UK data-protection law. The Privacy Policy should be read separately from these Terms."),
        ],
    },
    {
        num: 62,
        title: "Sharing Contact Details",
        blocks: [
            p("CarMazium may share appropriate contact details between users where reasonably necessary to complete a transaction. Recipients must use such details only for legitimate transaction purposes or otherwise lawfully."),
        ],
    },
    {
        num: 63,
        title: "Marketing Communications",
        blocks: [
            p("Marketing communications will be sent in accordance with applicable law and user preferences. Transactional communications necessary to administer Accounts, Auctions, Listings, security, Handover or incentives may still be sent where appropriate."),
        ],
    },
    {
        num: 64,
        title: "Seller Safety",
        blocks: [
            p("Sellers should not:"),
            ul([
                "release a Vehicle before confirmed cleared payment",
                "disclose online banking passwords", "share security codes",
                "permit another person remote access to their banking",
                "rely solely on a payment screenshot", "provide unnecessary sensitive documents",
            ]),
        ],
    },
    {
        num: 65,
        title: "Buyer Safety",
        blocks: [
            p("Buyers should review Vehicle information, inspect where appropriate, verify the identity of the Vehicle, satisfy themselves about condition, use lawful payment methods, and keep transaction evidence."),
        ],
    },
    {
        num: 66,
        title: "CarMazium Liability — General",
        blocks: [
            p("Nothing in these Terms excludes or limits liability where it would be unlawful to do so. This includes liability for death or personal injury caused by negligence, fraud, fraudulent misrepresentation, and other liability that cannot legally be excluded."),
        ],
    },
    {
        num: 67,
        title: "Vehicle Sale Liability",
        blocks: [
            p("Because CarMazium is not ordinarily the Buyer or Seller, CarMazium is not responsible merely because a Vehicle later develops a fault, a Seller misdescribes a Vehicle, a Buyer fails to pay, a Seller fails to hand over, a Dealer fails to collect, a third-party Vehicle database is wrong, Buyer and Seller disagree about Vehicle condition, or one party breaches the Vehicle Sale Contract. This does not exclude responsibility for CarMazium's own breach where liability cannot lawfully be excluded."),
        ],
    },
    {
        num: 68,
        title: "Business User Losses",
        blocks: [
            p("For Dealers and other business users, and to the extent permitted by law, CarMazium will not be liable for indirect or consequential losses such as loss of profit, lost resale margin, lost business opportunity, loss of goodwill, anticipated savings, or business interruption, except where liability cannot legally be limited. A separate financial liability cap may be added following review of CarMazium's insurance and commercial exposure."),
        ],
    },
    {
        num: 69,
        title: "Consumer Rights",
        blocks: [
            p("Nothing in these Terms limits mandatory Consumer rights. Where any term conflicts with a legal right that cannot be excluded, that legal right prevails."),
        ],
    },
    {
        num: 70,
        title: "Business User Indemnity",
        blocks: [
            p("To the extent permitted by law, a business user must indemnify CarMazium against reasonable losses arising directly from that user's fraud, deliberate Auction manipulation, unlawful processing of personal data, intellectual-property infringement, serious unlawful conduct, or material deliberate breach of these Terms. This clause does not apply to the extent that the loss was caused by CarMazium."),
        ],
    },
    {
        num: 71,
        title: "Complaints",
        blocks: [
            p("Users may contact CarMazium using the details below. CarMazium will aim to investigate complaints fairly and within a reasonable period."),
        ],
    },
    {
        num: 72,
        title: "Changes to These Terms",
        blocks: [
            p("CarMazium may change these Terms where reasonably necessary, including because of legal changes, regulatory requirements, Platform changes, security, fraud prevention, new services, or clarification of existing terms. Material changes affecting users should be notified reasonably where appropriate. New Terms will not normally retrospectively alter completed transactions."),
        ],
    },
    {
        num: 73,
        title: "Severability",
        blocks: [
            p("If part of these Terms is found invalid or unenforceable, the remaining Terms continue to apply so far as legally possible."),
        ],
    },
    {
        num: 74,
        title: "No Waiver",
        blocks: [
            p("If CarMazium does not enforce a right immediately, this does not automatically mean the right has been waived."),
        ],
    },
    {
        num: 75,
        title: "Assignment",
        blocks: [
            p("Users may not transfer their Account without CarMazium's permission. CarMazium may transfer its rights and obligations in connection with a lawful sale, restructuring or transfer of its business, provided mandatory Consumer rights are not reduced."),
        ],
    },
    {
        num: 76,
        title: "Third-Party Rights",
        blocks: [
            p("Unless expressly stated otherwise, a person who is not a party to these Terms has no right to enforce them under the Contracts (Rights of Third Parties) Act 1999."),
        ],
    },
    {
        num: 77,
        title: "Governing Law",
        blocks: [
            p("These Terms are governed by the laws of England and Wales. For business users, the courts of England and Wales will have exclusive jurisdiction unless otherwise agreed in writing. Consumers retain any mandatory jurisdiction rights available to them under applicable law."),
        ],
    },
    {
        num: 78,
        title: "Auction Seller Process Summary",
        blocks: [
            { type: "steps", items: [
                "Get a valuation — Seller enters Vehicle information.",
                "List for Auction FREE — no Seller Auction Listing Fee.",
                "Dealers bid — approved Dealers compete.",
                "Dealer wins — the successful bid determines the Buyer, subject to these Terms.",
                "Dealer contacts Seller — collection and inspection are arranged directly.",
                "Dealer inspects Vehicle — Dealer confirms Vehicle is materially as described.",
                "Dealer pays Seller directly — CarMazium never handles the Purchase Price.",
                "Seller confirms cleared funds — Seller checks their own bank account.",
                "Seller completes Handover — Vehicle, keys and applicable documents are handed over.",
                "Vehicle is transferred appropriately — Seller and Dealer complete applicable trade/DVLA process.",
                "Handover Evidence is submitted — Seller provides requested evidence to CarMazium.",
                "CarMazium approves Handover.",
                "Eligible Seller receives £100 incentive.",
            ] },
        ],
    },
    {
        num: 79,
        title: "Auction Buyer Process Summary",
        blocks: [
            p("For Dealers: browse stock → review Vehicle information → bid → win Auction → pay CarMazium £125 Auction Buyer Fee → contact Seller → inspect Vehicle → pay Seller directly → collect Vehicle → complete Handover."),
            p("The £125 fee is payable to CarMazium. The Vehicle Purchase Price is payable to the Seller."),
        ],
    },
    {
        num: 80,
        title: "Retail Process Summary",
        blocks: [
            p("For Retail Listings: Seller pays £1 Listing Fee → Vehicle is advertised → Buyer contacts Seller → Buyer and Seller agree transaction directly → Buyer pays Seller directly."),
            p("There is no £125 Retail Buyer Fee and, ordinarily, no £100 Auction Seller Incentive — the £100 Seller Incentive applies to eligible qualifying Auction sales."),
        ],
    },
    {
        num: 81,
        title: "Important Money-Flow Summary",
        blocks: [
            { type: "money", title: "Auction example — Vehicle sells through Auction for £10,000", lines: [
                "Dealer pays Seller: £10,000",
                "Dealer pays CarMazium: £125 Auction Buyer Fee",
                "CarMazium pays eligible Seller: £100 Seller Incentive after approved Handover",
                "CarMazium never receives the £10,000 Vehicle Purchase Price",
            ] },
            { type: "money", title: "Retail example — Vehicle sells through Retail Listing for £10,000", lines: [
                "Seller pays CarMazium: £1 Retail Listing Fee",
                "Buyer pays Seller: £10,000",
                "Buyer pays CarMazium: £0 Buyer Fee",
                "CarMazium pays Seller: £0 Auction Incentive unless a separate promotion expressly applies",
            ] },
        ],
    },
    {
        num: 82,
        title: "Company Information",
        blocks: [
            p("CARMAZIUM LTD — Company number: 17053307 — Registered in England and Wales."),
            p("Registered office: 181 Hunters Road, Birmingham, United Kingdom, B19 1ES."),
            p("Email: info@carmazium.com — Telephone: 0121 838 5040."),
        ],
    },
    {
        num: 83,
        title: "Acceptance",
        blocks: [
            p("By creating an Account or using a CarMazium service, you confirm that you have read and agree to these Terms."),
        ],
    },
]

// ─── Rendering ──────────────────────────────────────────────────────────────

function BlockRenderer({ block }: { block: Block }) {
    switch (block.type) {
        case "p":
            return <p>{block.text}</p>
        case "ul":
            return (
                <ul className="list-disc pl-5 space-y-2">
                    {block.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
            )
        case "dl":
            return (
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    {block.items.map((item) => (
                        <div key={item.term} className="text-sm">
                            <dt className="font-bold text-[var(--text-primary)]">{item.term}</dt>
                            <dd className="text-[var(--text-secondary)]">{item.def}</dd>
                        </div>
                    ))}
                </dl>
            )
        case "steps":
            return (
                <ol className="space-y-2">
                    {block.items.map((item, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                            <span className="pt-0.5">{item}</span>
                        </li>
                    ))}
                </ol>
            )
        case "money":
            return (
                <div className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg p-4">
                    <p className="font-bold text-sm mb-2">{block.title}</p>
                    <ul className="space-y-1 text-sm">
                        {block.lines.map((line, i) => <li key={i} className="text-[var(--text-secondary)]">{line}</li>)}
                    </ul>
                </div>
            )
        case "callout": {
            const tone = block.tone === "danger"
                ? { wrap: "bg-red-500/10 border-red-500/20 text-red-200", icon: <ShieldAlert className="shrink-0 text-red-500" size={18} /> }
                : block.tone === "warn"
                    ? { wrap: "bg-amber-500/10 border-amber-500/20 text-amber-200", icon: <AlertTriangle className="shrink-0 text-amber-500" size={18} /> }
                    : { wrap: "bg-blue-500/10 border-blue-500/20 text-blue-200", icon: <Info className="shrink-0 text-blue-400" size={18} /> }
            return (
                <div className={`rounded-lg p-4 flex gap-3 border text-sm ${tone.wrap}`}>
                    {tone.icon}
                    <p>{block.text}</p>
                </div>
            )
        }
    }
}

export default function TermsPage() {
    return (
        <div className="min-h-screen pt-32 pb-20 relative">
            <div className="absolute inset-0 -z-10" style={{ background: 'var(--bg-body)' }} />

            <div className="container mx-auto px-5 max-w-4xl">
                {/* Header */}
                <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 text-primary mb-6 shadow-[0_0_30px_rgba(237,28,36,0.2)]">
                        <Scale size={32} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-heading font-black mb-4 uppercase tracking-tight">Terms & Conditions</h1>
                    <p className="text-[var(--text-muted)] text-lg max-w-2xl mx-auto">
                        These Terms govern your access to and use of the CarMazium website, online marketplace, auction facilities, retail listings, dealer services, Mazium AI features and associated services.
                    </p>
                    <p className="text-[var(--text-muted)] text-sm mt-3">Last Updated: 10 September 2026</p>
                </div>

                {/* Company card */}
                <div className="bg-[var(--bg-card)] backdrop-blur-md rounded-2xl border border-[var(--border-default)] p-6 mb-10 grid sm:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-start gap-3">
                        <MapPin className="shrink-0 text-primary mt-0.5" size={16} />
                        <div>
                            <p className="font-bold">CARMAZIUM LTD</p>
                            <p className="text-[var(--text-muted)]">Company no. 17053307 · England & Wales</p>
                            <p className="text-[var(--text-muted)]">181 Hunters Road, Birmingham, B19 1ES, UK</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Mail className="shrink-0 text-primary mt-0.5" size={16} />
                        <a href="mailto:info@carmazium.com" className="text-[var(--text-secondary)] hover:text-primary transition-colors">info@carmazium.com</a>
                    </div>
                    <div className="flex items-start gap-3">
                        <Phone className="shrink-0 text-primary mt-0.5" size={16} />
                        <a href="tel:+441218385040" className="text-[var(--text-secondary)] hover:text-primary transition-colors">0121 838 5040</a>
                    </div>
                </div>

                {/* Key-points callouts, mirroring the most load-bearing clauses */}
                <div className="space-y-3 mb-10">
                    <BlockRenderer block={callout("info", "CarMazium is a marketplace only — it never buys, sells, owns, or takes payment for a Vehicle. The Vehicle Sale Contract is always directly between Seller and Buyer/Dealer (see Section 2).")} />
                    <BlockRenderer block={callout("warn", "Sellers: never release a Vehicle on the strength of a payment screenshot alone — always confirm cleared funds in your own bank account first (Sections 26 & 64).")} />
                    <BlockRenderer block={callout("danger", "By creating an Account or using any CarMazium service, you confirm that you have read and agree to all 83 sections below (Section 83).")} />
                </div>

                {/* Table of contents */}
                <div className="bg-[var(--bg-card)] backdrop-blur-md rounded-2xl border border-[var(--border-default)] p-6 mb-10">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)] mb-4">Jump to a section</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                        {SECTIONS.map((s) => (
                            <a key={s.num} href={`#section-${s.num}`} className="text-[var(--text-secondary)] hover:text-primary transition-colors truncate">
                                {s.num}. {s.title}
                            </a>
                        ))}
                    </div>
                </div>

                {/* Sections */}
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
                    {SECTIONS.map((section) => (
                        <section
                            key={section.num}
                            id={`section-${section.num}`}
                            className="bg-[var(--bg-card)] backdrop-blur-md rounded-2xl border border-[var(--border-default)] p-6 md:p-8 shadow-xl scroll-mt-24"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                    <span className="font-bold text-sm">{section.num}</span>
                                </div>
                                <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wide">{section.title}</h2>
                            </div>
                            <div className="text-[var(--text-secondary)] space-y-3 pl-13 text-sm leading-relaxed">
                                {section.blocks.map((block, i) => <BlockRenderer key={i} block={block} />)}
                            </div>
                        </section>
                    ))}
                </div>

                <p className="text-center text-xs text-[var(--text-muted)] mt-12">
                    CarMazium Ltd · Registered in England and Wales · Company No. 17053307
                </p>
            </div>
        </div>
    )
}
