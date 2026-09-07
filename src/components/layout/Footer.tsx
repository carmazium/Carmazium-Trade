"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/Button"
import { Mail, Phone, MapPin } from "lucide-react"
import { useConsent } from "@/context/ConsentContext"
import { useAuth } from "@/context/AuthContext"
import { canAccessTradeExchange } from "@/lib/tradeAccess"

export function Footer() {
    const { openPreferences } = useConsent()
    const { user, profile } = useAuth()
    // Same rule as the header: signed-in non-dealers don't get a link to a room
    // they can't enter; guests still do, because /auctions recruits dealers.
    const showTradeExchange = !user || canAccessTradeExchange(profile?.role)
    return (
        <footer className="bg-gradient-to-t from-[#1e293b] to-[#2d3c63] text-white pt-16 pb-8 border-t border-white/5 mt-auto">
            <div className="container mx-auto px-5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">

                    {/* Brand Column */}
                    <div className="space-y-4">
                        <Link href="/" className="inline-block">
                            <Image
                                src="/assets/images/logo.png"
                                alt="CarMazium"
                                width={400}
                                height={100}
                                className="h-10 w-auto"
                                priority
                            />
                        </Link>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Carmazium is a next-generation car marketplace built for buying and selling vehicles securely. We connect buyers and sellers through verified listings and intelligent pricing.
                        </p>
                        <div className="flex gap-4">
                            {/* Social placeholders */}
                        </div>
                    </div>

                    {/* Links Column */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wide">Page</h3>
                        <ul className="space-y-2 text-gray-400">
                            <li><Link href="/" className="hover:text-primary transition-colors">Home</Link></li>
                            <li><Link href="/search" className="hover:text-primary transition-colors">Buy Cars</Link></li>
                            {showTradeExchange && (
                                <li><Link href="/auctions" className="hover:text-primary transition-colors">Trade Exchange</Link></li>
                            )}
                            <li><Link href="/sell" className="hover:text-primary transition-colors">Sell Cars</Link></li>
                            <li><Link href="/about" className="hover:text-primary transition-colors">About</Link></li>
                            <li><Link href="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link></li>
                            <li><Link href="/cookie-policy" className="hover:text-primary transition-colors">Cookie Policy</Link></li>
                        </ul>
                    </div>

                    {/* Contact Column */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wide">Contact Us</h3>
                        <ul className="space-y-3 text-gray-400">
                            <li className="flex items-center gap-3 hover:text-primary transition-colors">
                                <Mail size={18} className="text-primary shrink-0" />
                                <a href="mailto:info@carmazium.com">info@carmazium.com</a>
                            </li>
                            <li className="flex items-center gap-3 hover:text-primary transition-colors">
                                <Phone size={18} className="text-primary shrink-0" />
                                <a href="tel:+441218385040">0121 838 5040</a>
                            </li>
                            <li className="flex items-start gap-3">
                                <MapPin size={18} className="text-primary shrink-0 mt-0.5" />
                                <span>181-187 Hunters Rd, Lozells,<br />Birmingham, B19 1ES,<br />United Kingdom</span>
                            </li>
                            <li className="text-xs text-gray-500 pl-7">Mon – Fri, 9am – 6pm GMT</li>
                        </ul>
                    </div>

                    {/* Newsletter Column */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wide">Newsletter</h3>
                        <p className="text-gray-400 text-sm">Subscribe to receive car deals, listing alerts, and market insights.</p>
                        <form className="flex flex-col gap-2">
                            <input
                                type="email"
                                placeholder="Your Email"
                                className="px-4 py-3 bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                            />
                            <Button className="w-full">Subscribe</Button>
                        </form>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-8 text-center text-gray-500 text-sm flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                    <p>&copy; {new Date().getFullYear()} CarMazium. All Rights Reserved.</p>
                    <button onClick={openPreferences} className="hover:text-primary transition-colors underline underline-offset-2">
                        Cookie Preferences
                    </button>
                </div>
            </div>
        </footer>
    )
}
