
interface Sponsor {
    name: string;
    logo?: string;
    logoSize?: string;
    imgClassName?: string;
}

interface SponsorGridProps {
    sponsors: Sponsor[];
    title: string;
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
    return (
        <div className={`px-6 py-8 ${className}`}>
            <h2 className="mb-4 text-4xl font-bold text-left">{title}</h2>
            <hr className="mb-16 border-t border-gray-300" />
            <div className={`${columns} gap-x-6 ${rowGap}`}>
                {sponsors.map((sponsor) => {
                    const hasLogo = !!sponsor.logo;
                    const containerHeightClass = 'h-24';
                    const imgExtra = [sponsor.logoSize, sponsor.imgClassName].filter(Boolean).join(' ');
                    return (
                        <div
                            key={sponsor.name}
                            className={`flex flex-col items-center justify-center ${hasLogo ? containerHeightClass : textOnlyHeight}`}
                        >
                            {hasLogo ? (
                                <img
                                    src={sponsor.logo}
                                    alt={sponsor.name}
                                    className={`object-contain transition-opacity duration-300 max-h-full group-hover:opacity-50 hover:!opacity-100 cursor-pointer ${imgExtra}`}
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
        </div>
    );
};