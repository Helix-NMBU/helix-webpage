
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
            transition={{ duration: 0.6 }}
            className={`px-16 py-8 ${className}`}
        >
            <h2 className="mb-4 text-4xl font-bold text-left">{title}</h2>
            <hr className="mb-16 border-t border-gray-300" />
            <div className={`${columns} gap-x-30 ${rowGap}`}>
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
            </div>
        </motion.div>
    );
};