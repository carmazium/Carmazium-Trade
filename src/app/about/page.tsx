"use client"

import Image from "next/image"
import { Users, Globe, Award, TrendingUp, Handshake, Target, Rocket, MapPin, Phone } from "lucide-react"
import { motion, useScroll, useTransform } from "framer-motion"

import { AccordionItem } from "@/components/ui/Accordion"
import { TestimonialsSection } from "@/components/features/TestimonialsSection"
import { Button } from "@/components/ui/Button"
import { useRef } from "react"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"

export default function AboutPage() {
    const { user } = useAuth()
    const targetRef = useRef(null)
    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ["start end", "end start"],
    })



    return (
        <div className="min-h-screen pb-20 overflow-x-hidden">

            {/* Cinematic Hero Section */}
            <section className="relative h-[80vh] flex items-center justify-center overflow-hidden select-none">
                <div className="absolute inset-0 w-full h-full">
                    {/* Reusing hero video or similar cinematic visual */}
                    <div className="absolute inset-0 z-10 dark:bg-slate-900/40" />
                    <div className="absolute inset-0 z-10 dark:bg-gradient-to-t dark:from-slate-900 dark:via-transparent dark:to-transparent" />
                    <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="none"
                        poster="/assets/videos/about-cinematic-poster.jpg"
                        className="absolute inset-0 w-full h-full object-cover blur-[2px] scale-105"
                    >
                        {/* Re-encoded from an 86MB 4K .mov to a 1080p/CRF30 .mp4 —
                            same 68Mbps 4K master was being served to every visitor
                            for a background layer the CSS blurs and mutes anyway. */}
                        <source src="/assets/videos/about-cinematic.mp4" type="video/mp4" />
                    </video>
                </div>

                <div className="container mx-auto px-5 relative z-20 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="text-5xl md:text-7xl font-bold font-heading mb-6 text-white drop-shadow-2xl">
                            Redefining <span className="text-primary italic">Excellence</span> <br /> in Automotive Trading
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto leading-relaxed">
                            CarMazium bridges the gap between digital convenience and showroom luxury. We are not just a marketplace; we are the future of car buying.
                        </p>
                    </motion.div>
                </div>
            </section>



            {/* Our Story & Values */}
            <section className="py-24 container mx-auto px-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="relative">
                            <div className="absolute -left-10 -top-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
                            <h2 className="text-4xl font-bold font-heading mb-8 relative z-10">Driven by <span className="text-primary">Passion</span>, <br />Powered by Tech.</h2>
                        </div>
                        <p className="text-[var(--text-muted)] text-lg leading-relaxed mb-6">
                            Founded in 2024, CarMazium emerged from a simple observation: the luxury car market was stuck in the past. High fees, opaque processes, and outdated interfaces were the norm. Use believed there was a better way.
                        </p>
                        <p className="text-[var(--text-muted)] text-lg leading-relaxed mb-8">
                            We combined deep automotive expertise with cutting-edge web technology to create a platform that respects your time and intelligence. Real-time auctions, verified verification, and instant financing—all in one place.
                        </p>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="glass-card p-6 flex flex-col gap-4 group hover:border-primary/50 transition-colors">
                                <Target className="text-primary h-8 w-8 group-hover:scale-110 transition-transform" />
                                <div>
                                    <h4 className="font-bold mb-1">Our Mission</h4>
                                    <p className="text-sm text-[var(--text-muted)]">To democratize access to premium vehicles through transparency.</p>
                                </div>
                            </div>
                            <div className="glass-card p-6 flex flex-col gap-4 group hover:border-primary/50 transition-colors">
                                <Rocket className="text-primary h-8 w-8 group-hover:scale-110 transition-transform" />
                                <div>
                                    <h4 className="font-bold mb-1">Our Vision</h4>
                                    <p className="text-sm text-[var(--text-muted)]">A world where buying a dream car is as easy as ordering a pizza.</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <div className="relative h-[600px] w-full rounded-3xl overflow-hidden glass-strong p-2 group" ref={targetRef}>
                        <div className="relative h-full w-full rounded-2xl overflow-hidden">
                            <Image
                                src="/assets/images/featured-sports.png"
                                alt="Our Story"
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-1000"
                            />
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/20 to-slate-900/80 pointer-events-none" />

                            {/* Live Stats Overlay */}
                            <div className="absolute bottom-6 left-4 right-4 grid grid-cols-2 gap-2 sm:gap-8 text-white text-center sm:text-left">
                                <div>
                                    <div className="text-2xl sm:text-4xl font-bold font-mono text-primary truncate">50,000+</div>
                                    <div className="text-xs sm:text-sm opacity-80 uppercase tracking-widest mt-1">Users</div>
                                </div>
                                <div>
                                    <div className="text-2xl sm:text-4xl font-bold font-mono text-primary truncate">£200M+</div>
                                    <div className="text-xs sm:text-sm opacity-80 uppercase tracking-widest mt-1">Traded</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <TestimonialsSection />

            {/* Team Section */}
            <section className="py-24 bg-[var(--bg-card)]">
                <div className="container mx-auto px-5">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">Meet The <span className="text-primary">Visionaries</span></h2>
                        <p className="text-[var(--text-muted)] max-w-2xl mx-auto text-lg">The diverse team of petrolheads and engineers working behind the scenes.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                        {[
                            { name: "Afaq Iftikhar", role: "Chief Executive Officer", desc: "Visionary entrepreneur driving CarMazium's mission to redefine the automotive marketplace.", delay: 0 },
                            { name: "Wajahat Ali", role: "Head of Operations", desc: "Ensuring seamless operations and an exceptional experience for every buyer and seller.", delay: 0.1 },
                        ].map((member, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: member.delay }}
                                className="glass-card p-6 text-center group hover:-translate-y-2 transition-transform duration-300"
                            >
                                <div className="relative h-48 w-48 mx-auto rounded-full mb-6 overflow-hidden border-4 border-[var(--border-default)] group-hover:border-primary/50 transition-colors bg-[var(--bg-input)]">
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700/20 to-slate-800/20 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center group-hover:bg-slate-700/10 dark:group-hover:bg-slate-700 transition-colors">
                                        <Users className="text-[var(--text-faint)] h-20 w-20 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold mb-1 group-hover:text-primary transition-colors">{member.name}</h3>
                                <p className="text-primary/80 font-medium text-sm mb-4 uppercase tracking-wider">{member.role}</p>
                                <p className="text-[var(--text-muted)]">{member.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Contact & Location Section */}
            <section className="py-20 container mx-auto px-5">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <h2 className="text-3xl md:text-5xl font-heading font-bold mb-4">Get In <span className="text-primary">Touch</span></h2>
                    <p className="text-[var(--text-muted)] max-w-xl mx-auto">We&apos;d love to hear from you. Visit us or reach out directly.</p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="glass-card p-8 flex flex-col gap-4 group hover:border-primary/40 transition-colors"
                    >
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <MapPin className="text-primary w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold mb-2">Our Location</h3>
                            <p className="text-[var(--text-muted)] leading-relaxed">
                                181-187 Hunters Rd<br />
                                Lozells, Birmingham<br />
                                B19 1ES, United Kingdom
                            </p>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="glass-card p-8 flex flex-col gap-4 group hover:border-primary/40 transition-colors"
                    >
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Phone className="text-primary w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold mb-2">Contact Us</h3>
                            <p className="text-[var(--text-muted)] mb-1">
                                <a href="tel:+441218385040" className="hover:text-primary transition-colors">0121 838 5040</a>
                            </p>
                            <p className="text-[var(--text-faint)] text-sm">Monday – Friday, 9am – 6pm GMT</p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-24 container mx-auto px-5">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-3xl md:text-5xl font-heading font-bold mb-6">Frequently Asked <span className="text-primary">Questions</span></h2>
                        <p className="text-[var(--text-muted)] text-lg">Everything you need to know about the CarMazium experience.</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <AccordionItem title="Is CarMazium involved in the sale of vehicles?" defaultOpen>
                            <p className="font-semibold mb-2 text-[var(--text-primary)]">CarMazium is a marketplace platform only — we are not a buyer or seller.</p>
                            <p>We provide the tools, technology, and platform that connect private sellers and dealers with buyers. All vehicle purchases, payments, and handover arrangements are made <strong className="text-[var(--text-primary)]">directly between the buyer and seller</strong>. CarMazium is not a party to any vehicle sale and does not hold, process, or handle any vehicle purchase funds.</p>
                        </AccordionItem>
                        <AccordionItem title="How does vehicle verification work?">
                            <p>CarMazium auto-fills available DVLA vehicle data from the registration plate, records seller-supplied service history and damage information, and requires a vehicle-history/HPI review before a listing can go live. Buyers can review the available vehicle information before making contact. We always recommend arranging an independent inspection before completing any purchase.</p>
                        </AccordionItem>
                        <AccordionItem title="How do the live auctions work?">
                            <p>Our live auctions run for 24 hours with real-time competitive bidding and anti-snipe protection. Once an auction closes, the winning bidder and seller are connected directly via our in-platform chat to agree terms and arrange payment between themselves. CarMazium does not process or hold auction sale funds.</p>
                        </AccordionItem>
                        <AccordionItem title="Can I sell my car on CarMazium?">
                            <p>Yes. Simply create your listing — DVLA data is auto-filled from your registration plate. Upload photos, set your price or auction reserve, and go live. All buyer enquiries, offers, and bids come directly to you. You agree terms and handle payment with the buyer directly, without CarMazium being involved in the transaction.</p>
                        </AccordionItem>
                        <AccordionItem title="What financing options are available?">
                            <p>We partner with finance providers who offer vehicle financing. Applications are submitted directly to the finance provider through our platform. CarMazium facilitates the introduction but is not a party to any finance agreement — all terms are between you and the lender.</p>
                        </AccordionItem>
                        <AccordionItem title="Are there any fees?">
                            <p>Sellers pay a one-time listing badge fee to boost visibility — ranging from Free up to £25 (Basic £1, Standard £10, Premium £25). Auction winners pay a one-time <strong className="text-[var(--text-primary)]">£125 platform fee</strong> on winning a bid. The vehicle purchase price itself is always agreed and paid <strong className="text-[var(--text-primary)]">directly between buyer and seller</strong> — CarMazium does not handle vehicle sale payments.</p>
                        </AccordionItem>
                    </motion.div>
                </div>
            </section>

            {/* CTA — only for non-authenticated visitors */}
            {!user && <section className="py-20 container mx-auto px-5">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="glass-strong rounded-3xl p-16 text-center relative overflow-hidden group border border-[var(--border-default)]"
                >
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('/assets/images/hero-bg.png')] opacity-10 blur-sm bg-cover" />
                    <div className="absolute inset-0 dark:bg-gradient-to-r dark:from-slate-900/90 dark:via-slate-900/80 dark:to-slate-900/90" />

                    <div className="relative z-10 max-w-2xl mx-auto">
                        <h2 className="text-4xl font-bold text-[var(--text-primary)] mb-8">Ready to start your journey?</h2>
                        <p className="text-[var(--text-muted)] mb-10 text-lg">Join the fastest growing luxury automotive community today.</p>
                        <div className="flex flex-col sm:flex-row justify-center gap-6">
                            <Link href="/search" className="w-full sm:w-auto">
                                <Button size="lg" className="px-6 sm:px-10 py-6 text-base sm:text-lg shadow-neon w-full whitespace-nowrap">BROWSE INVENTORY</Button>
                            </Link>
                            <Link href="/how-it-works" className="w-full sm:w-auto">
                                <Button size="lg" variant="outline" className="px-6 sm:px-10 py-6 text-base sm:text-lg w-full whitespace-nowrap">HOW IT WORKS</Button>
                            </Link>
                            <Link href="/auth/signup" className="w-full sm:w-auto">
                                <Button size="lg" variant="ghost" className="px-6 sm:px-10 py-6 text-base sm:text-lg text-[var(--text-muted)] hover:text-primary hover:bg-[var(--bg-card)] w-full whitespace-nowrap">CREATE ACCOUNT</Button>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </section>}
        </div>
    )
}
