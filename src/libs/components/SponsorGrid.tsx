
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface Sponsor {
    name: string;
    logo?: string;
    logoSize?: string;
    imgClassName?: string;
}

interface SponsorGridProps {
    sponsors: Sponsor[];
    title: 'Main' | 'Gold' | 'Silver' | 'Bronze' | 'Service';
    textOnlyHeight?: string;
    className?: string;
    columns?: string;
    rowGap?: string;
}

export const SponsorGrid = ({
    sponsors,
    title,
    textOnlyHeight = 'h-16',
    className = '',
    columns = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    rowGap = 'gap-y-4'
}: SponsorGridProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { once: true, amount: 0.2 });

    const motionState = isInView
        ? { opacity: 1, y: 0 }
        : { opacity: 0, y: 40 };

    const titleColorClass = ({
        Main: 'text-[var(--color-sponsor-main)]',
        Gold: 'text-[var(--color-sponsor-gold)]',
        Silver: 'text-[var(--color-sponsor-silver)]',
        Bronze: 'text-[var(--color-sponsor-bronze)]',
        Service: 'text-[var(--color-sponsor-service)]'
    } as const)[title] ?? 'text-foreground';

    return (
        <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 40 }}
            animate={motionState}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`px-6 py-8 ${className}`}
        >
            <motion.h2
                className={`mb-4 text-4xl font-bold text-left ${titleColorClass}`}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            >
                {title}
            </motion.h2>
            <motion.hr
                className="mb-16 border-t border-gray-300"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={isInView ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
                style={{ transformOrigin: 'left center' }}
            />
            <motion.div
                className={`${columns} gap-x-6 ${rowGap}`}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            >
                {sponsors.map((sponsor) => {
                    const hasLogo = !!sponsor.logo;
                    const containerHeightClass = 'h-24';
                    const imgExtra = [sponsor.logoSize, sponsor.imgClassName].filter(Boolean).join(' ');
                    return (
                        <div
                            key={sponsor.name}
                            className={`flex flex-col cursor-pointer items-center justify-center ${hasLogo ? containerHeightClass : textOnlyHeight}`}
                        >
                            {hasLogo ? (
                                <img
                                    src={sponsor.logo}
                                    alt={sponsor.name}
                                    className={`object-contain max-h-full ${imgExtra}`}
                                />
                            ) : (
                                <h3 className="text-lg font-medium cursor-pointer hover:underline hover:decoration-accent hover:underline-offset-4">
                                    {sponsor.name}
                                </h3>
                            )}
                        </div>
                    );
                })}
            </motion.div>
        </motion.div>
    );
};