import { useEffect, useState } from "react";
import { SponsorGrid } from "@/features/Sponsors/components/SponsorGrid";

interface SponsorData {
    id: number;
    name: string;
    image?: string;
    link?: string;
    category: 'Main' | 'Gold' | 'Silver' | 'Bronze' | 'Service';
    logoSize?: string;
}

const SponsorPage = () => {
    const [sponsors, setSponsors] = useState<SponsorData[]>([]);

    useEffect(() => {
        fetch('/sponsor.json')
            .then(res => res.json())
            .then(data => setSponsors(data))
            .catch(err => console.error('Failed to load sponsors:', err));
    }, []);

    const getGridLayout = (category: string) => {
        const layouts: Record<string, { columns: string; rowGap: string }> = {
            Main: { columns: 'grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1', rowGap: 'gap-y-12' },
            Gold: { columns: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2', rowGap: 'gap-y-12' },
            Silver: { columns: 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3', rowGap: 'gap-y-6' },
            Bronze: { columns: 'grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4', rowGap: 'gap-y-6' },
            Service: { columns: 'grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5', rowGap: 'gap-y-4' }
        };
        return layouts[category] || { columns: 'grid grid-cols-2', rowGap: 'gap-y-4' };
    };

    const categories = ['Main', 'Gold', 'Silver', 'Bronze', 'Service'] as const;

    return (
        <div className="mx-auto mt-20 max-w-7xl group">
            <div className="py-12 bg-background text-foreground">
                <h1 className="text-5xl font-bold text-center">Our Partners</h1> 
                <p className="text-center text-md text-accent">The ones making it all possible</p>    
            </div>

            {categories.map(category => {
                const categorySponsors = sponsors
                    .filter(s => s.category === category)
                    .map(s => ({
                        name: s.name,
                        logo: s.image,
                        link: s.link,
                        logoSize: s.logoSize
                    }));

                if (categorySponsors.length === 0) return null;

                const layout = getGridLayout(category);

                return (
                    <SponsorGrid
                        key={category}
                        title={category}
                        columns={layout.columns}
                        rowGap={layout.rowGap}
                        textOnlyHeight="h-16"
                        sponsors={categorySponsors}
                    />
                );
            })}
        </div>
    )
}

export default SponsorPage;