"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/Button"
import { ChevronLeft, ChevronRight } from "lucide-react"

const slides = [
    {
        id: 1,
        type: "video",
        src: "/assets/videos/promo-cinematic.mp4",
        poster: "/assets/images/promo-car.png",
        subtitle: "BUY & SELL",
        title: (
            <>
                <span className="text-primary inline-block transform group-hover:scale-110 transition-transform origin-left duration-300">MODERN</span> AND LUXURY <br /> CARS WITH CONFIDENCE
            </>
        ),
        description: "Whether you’re looking to buy your next car, sell your existing one, or auction vehicles at the best market value, Carmazium offers a seamless experience. Our platform ensures verified listings, fair pricing, and complete transparency at every step.",
        cta: "VIEW LISTINGS",
        href: "/search"
    },
    {
        id: 2,
        type: "image",
        src: "/assets/images/live-auction-hero.jpg",
        subtitle: "LIVE AUCTIONS",
        title: (
            <>
                EXPERIENCE THE <span className="text-primary">THRILL</span> OF <br /> REAL-TIME BIDDING
            </>
        ),
        description: "Join our exclusive live auction rooms and bid on premium vehicles in real-time. Watch the action unfold, place your bids securely, and win your dream car from the comfort of your home.",
        cta: "ENTER AUCTION ROOM",
        href: "/auctions"
    },
    {
        id: 3,
        type: "image",
        src: "/assets/images/featured-sports.png",
        subtitle: "SERVICE HUB",
        title: (
            <>
                EXPERT <span className="text-primary">CARE</span> & <br /> MAINTENANCE
            </>
        ),
        description: "Keep your luxury vehicle in pristine condition. Access our network of certified service centers for maintenance, repairs, and detailing. Quality service you can trust.",
        cta: "VISIT SERVICE HUB",
        href: "/services"
    }
]

export function PromoCarousel() {
    const [current, setCurrent] = useState(0)
    const [direction, setDirection] = useState(0)

    const nextSlide = () => {
        setDirection(1)
        setCurrent((prev) => (prev + 1) % slides.length)
    }

    const prevSlide = () => {
        setDirection(-1)
        setCurrent((prev) => (prev === 0 ? slides.length - 1 : prev - 1))
    }

    useEffect(() => {
        const timer = setInterval(() => {
            setDirection(1)
            setCurrent((prev) => (prev + 1) % slides.length)
        }, 8000)
        return () => clearInterval(timer)
    }, [])

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 100 : -100,
            opacity: 0
        }),
        center: {
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 100 : -100,
            opacity: 0
        })
    }

    return (
        <section className="py-24 overflow-hidden relative min-h-[700px] flex items-center">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800/30 to-slate-900 pointer-events-none" />

            <div className="container mx-auto px-5 relative z-10 h-full">
                <div className="relative h-full flex items-center">
                    <button
                        onClick={prevSlide}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-[var(--bg-card)] hover:bg-primary/20 hover:text-primary transition-all backdrop-blur-md hidden md:block"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <button
                        onClick={nextSlide}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-[var(--bg-card)] hover:bg-primary/20 hover:text-primary transition-all backdrop-blur-md hidden md:block"
                        aria-label="Next slide"
                    >
                        <ChevronRight size={24} />
                    </button>

                    <div className="w-full">
                        <AnimatePresence mode="wait" custom={direction}>
                            <motion.div
                                key={current}
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.5, ease: "easeInOut" }}
                                className="flex flex-col md:flex-row items-center gap-12 md:gap-20"
                            >
                                <div className="flex-1 relative w-full">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[var(--bg-card)] blur-[120px] rounded-full -z-10" />

                                    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-default)] group aspect-video bg-[var(--bg-input)]">
                                        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-10 pointer-events-none" />

                                        {slides[current].type === 'video' ? (
                                            <video
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-1000 ease-out"
                                                poster={slides[current].poster}
                                            >
                                                <source src={slides[current].src} type="video/mp4" />
                                            </video>
                                        ) : (
                                            <Image
                                                src={slides[current].src}
                                                alt={slides[current].subtitle}
                                                fill
                                                sizes="(max-width: 768px) 100vw, 50vw"
                                                className="object-cover transform group-hover:scale-105 transition-transform duration-1000 ease-out"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 text-left">
                                    <motion.div
                                        initial={{ opacity: 0, x: 50 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                    >
                                        <h2 className="text-4xl md:text-5xl font-bold font-heading mb-8 uppercase tracking-wide leading-tight text-white">
                                            {slides[current].title}
                                        </h2>

                                        <p className="text-gray-300 mb-10 leading-relaxed text-lg max-w-xl">
                                            {slides[current].description}
                                        </p>

                                        <Link href={slides[current].href}>
                                            <Button size="lg" className="px-10 py-6 text-lg shadow-neon hover:shadow-[0_0_30px_rgba(237,28,36,0.6)]">
                                                {slides[current].cta}
                                            </Button>
                                        </Link>
                                    </motion.div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <div className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 flex gap-3">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    setDirection(idx > current ? 1 : -1)
                                    setCurrent(idx)
                                }}
                                className={`h-2 rounded-full transition-all duration-300 ${idx === current ? "w-8 bg-primary" : "w-2 bg-gray-600 hover:bg-gray-400"
                                    }`}
                                aria-label={`Go to slide ${idx + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
