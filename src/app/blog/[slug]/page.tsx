import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar, User, Gavel, Search } from "lucide-react"
import type { BlogPost } from "@/lib/blogApi"
import type { Listing } from "@/lib/listingApi"
import { formatPrice } from "@/lib/listingApi"
import { BlogContent } from "@/components/blog/BlogContent"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://carmazium-hjoh9w.fly.dev"
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://carmazium.com"

async function getPostBySlug(slug: string): Promise<BlogPost | null> {
    try {
        const res = await fetch(`${API_BASE}/blog/${slug}`, { next: { revalidate: 300 } })
        if (!res.ok) return null
        const json = await res.json()
        return json.data ?? null
    } catch {
        return null
    }
}

async function getRelatedPosts(slug: string): Promise<BlogPost[]> {
    try {
        const res = await fetch(`${API_BASE}/blog/${slug}/related`, { next: { revalidate: 300 } })
        if (!res.ok) return []
        const json = await res.json()
        return json.data ?? []
    } catch {
        return []
    }
}

async function getFeaturedListings(): Promise<Listing[]> {
    try {
        const res = await fetch(`${API_BASE}/listings/featured`, { next: { revalidate: 300 } })
        if (!res.ok) return []
        const json = await res.json()
        return (json.data ?? []).slice(0, 3)
    } catch {
        return []
    }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const post = await getPostBySlug(slug)

    if (!post) {
        return { title: "Post Not Found", robots: { index: false, follow: false } }
    }

    const title = post.metaTitle || post.title
    const description = post.metaDescription || post.excerpt
    const url = `${SITE_URL}/blog/${post.slug}`

    return {
        title,
        description,
        alternates: { canonical: url },
        robots: { index: !post.noIndex, follow: true },
        openGraph: {
            title: `${title} | CarMazium`,
            description,
            url,
            type: "article",
            publishedTime: post.publishedAt ?? undefined,
            modifiedTime: post.updatedAt,
            images: post.coverImage ? [{ url: post.coverImage }] : undefined,
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} | CarMazium`,
            description,
            images: post.coverImage ? [post.coverImage] : undefined,
        },
    }
}

function formatDate(d: string | null) {
    if (!d) return ""
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const post = await getPostBySlug(slug)
    if (!post) notFound()

    const [relatedPosts, featuredListings] = await Promise.all([
        getRelatedPosts(slug),
        getFeaturedListings(),
    ])

    const url = `${SITE_URL}/blog/${post.slug}`
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        image: post.coverImage ? [post.coverImage] : undefined,
        datePublished: post.publishedAt ?? post.createdAt,
        dateModified: post.updatedAt,
        author: { "@type": "Organization", name: post.authorName },
        publisher: { "@type": "Organization", name: "CarMazium" },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
    }

    return (
        <div className="min-h-screen pt-28 pb-24">
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <article className="container mx-auto px-5 max-w-3xl">
                <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-primary transition-colors mb-8">
                    <ArrowLeft size={14} /> Back to Blog
                </Link>

                {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {post.tags.map((tag) => (
                            <Link
                                key={tag}
                                href={`/blog/tag/${encodeURIComponent(tag)}`}
                                className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
                            >
                                {tag}
                            </Link>
                        ))}
                    </div>
                )}

                <h1 className="text-3xl md:text-4xl font-black font-heading tracking-tight mb-4 leading-tight">{post.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)] mb-8 pb-8 border-b border-[var(--border-default)]">
                    <span className="flex items-center gap-1.5"><User size={13} /> {post.authorName}</span>
                    {post.publishedAt && <span className="flex items-center gap-1.5"><Calendar size={13} /> {formatDate(post.publishedAt)}</span>}
                </div>

                {post.coverImage && (
                    <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mb-10 bg-[var(--bg-input)]">
                        <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" priority />
                    </div>
                )}

                <BlogContent content={post.content} />

                {/* CTA — drives internal link equity to the core marketplace pages */}
                <div className="mt-14 rounded-2xl border border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <p className="text-sm font-bold text-[var(--text-primary)]">Ready to see what's out there?</p>
                    <div className="flex gap-3 shrink-0">
                        <Link href="/search" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
                            <Search size={14} /> Browse Cars
                        </Link>
                        <Link href="/auctions/browse" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-bold hover:border-primary/40 transition-colors">
                            <Gavel size={14} /> Live Auctions
                        </Link>
                    </div>
                </div>

                {featuredListings.length > 0 && (
                    <div className="mt-14">
                        <h2 className="text-lg font-black font-heading uppercase tracking-tight mb-5">Cars You Might Like</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            {featuredListings.map((listing) => (
                                <Link
                                    key={listing.id}
                                    href={`/buy-cars/${listing.slug}`}
                                    className="glass-card overflow-hidden group hover:border-primary/30 transition-colors block"
                                >
                                    <div className="h-32 overflow-hidden relative bg-[var(--bg-input)]">
                                        {listing.images?.[0] && (
                                            <Image src={listing.images[0]} alt={listing.title} width={300} height={150} sizes="33vw" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{listing.title}</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">{formatPrice(listing.price)}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {relatedPosts.length > 0 && (
                    <div className="mt-14 pt-10 border-t border-[var(--border-default)]">
                        <h2 className="text-lg font-black font-heading uppercase tracking-tight mb-5">Related Reading</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            {relatedPosts.map((related) => (
                                <Link
                                    key={related.id}
                                    href={`/blog/${related.slug}`}
                                    className="glass-card overflow-hidden group hover:border-primary/30 transition-colors block"
                                >
                                    <div className="h-32 overflow-hidden relative bg-[var(--bg-input)]">
                                        {related.coverImage && (
                                            <Image src={related.coverImage} alt={related.title} width={300} height={150} sizes="33vw" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <p className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">{related.title}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </article>
        </div>
    )
}
