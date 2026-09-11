from pathlib import Path

path = Path('src/app/dashboard/seller/auctions/page.tsx')
text = path.read_text(encoding='utf-8-sig')
old = '''                                            {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (auction.listing as any).linkedListing?.status === 'DRAFT' && (
                                                <button
                                                    onClick={async () => {
                                                        const linked = (auction.listing as any).linkedListing
                                                        const { url } = await createListingCheckout(linked.id, linked.badgeTier || 'BASIC')
                                                        window.location.href = url
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                                                >
                                                    <Tag size={13} /> Resume Retail Payment
                                                </button>
                                            )}'''
new = '''                                            {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (auction.listing as any).linkedListing?.status === 'DRAFT' && (
                                                <button
                                                    onClick={() => {
                                                        const linked = (auction.listing as any).linkedListing
                                                        // A linked Retail Listing is a distinct listing and must
                                                        // obtain its own fresh HPI before its listing fee can be paid.
                                                        window.location.href = `/sell?editId=${encodeURIComponent(linked.id)}`
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                                                >
                                                    <Tag size={13} /> Complete Retail Listing
                                                </button>
                                            )}'''
if old not in text:
    raise SystemExit('Expected Resume Retail Payment block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Linked retail resume flow now returns through mandatory HPI wizard')
