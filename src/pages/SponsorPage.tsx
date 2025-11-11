import { SponsorGrid } from "@libs/components/SponsorGrid";


const SponsorPage = () => {
    return (
        <div className="mx-auto max-w-7xl group">
            <div className="py-12 bg-background text-foreground">
             <h1 className="text-5xl font-bold text-center">Our Partners</h1> 
             <p className="text-center text-md text-accent">The ones making it all possible</p>    
            </div>

            {/* Main Sponsors */}
            <SponsorGrid
                title="Main"
                columns="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1"
                sponsors={[
                    { name: "Necia Tech Cluster", logo: "/sponsor_logos/Necia_logo.png", logoSize: "lg:scale-450 md:scale-350 scale-200" },
                ]}
            />

            {/* Gold Sponsors */}
            <SponsorGrid
                title="Gold"
                columns="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
                rowGap="gap-y-12"
                sponsors={[
                    { name: "SKF", logo: "/sponsor_logos/SKF_logo.png", logoSize: "scale-50 lg:scale-90" },
                    { name: "Ktech", logo: "/sponsor_logos/ktech_logo.png", logoSize: "scale-120 lg:scale-200" },
                    { name: "NU", logo: "/sponsor_logos/NU_logo.png", logoSize: "scale-70 lg:scale-70" },
                ]}
            />

            {/* Silver Sponsors */}
            <SponsorGrid
                title="Silver"
                columns="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3"
                rowGap="gap-y-6"
                sponsors={[
                    { name: "Norbygg", logo: "/sponsor_logos/Norbygg_logo.png", logoSize: "scale-80" },
                    { name: "Kranpartner", logo: "/sponsor_logos/Kranpartner_logo.png", logoSize: "scale-80" },
                ]}
            />


            {/* Bronze Sponsors */}
            <SponsorGrid
                title="Bronze"
                columns="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4"
                rowGap="gap-y-6"
                sponsors={[
                    { name: "Hellesøe Handel", logo: "/sponsor4.png", logoSize: "h-20" },
                    { name: "Vulkan Engineering", logo: "/sponsor_logos/Vulkan_logo.png", logoSize: "scale-60 lg:scale-60" },
                    { name: "NMBU", logo: "/sponsor_logos/NMBU_logo.png", logoSize: "scale-130 lg:scale-150 " },
                    { name: "MHTech", logo: "/sponsor_logos/MHTech_logo.png", logoSize: "scale-50 lg:scale-80 grayscale" },
                    { name: "SMT Service", logo: "/sponsor_logos/SMT_logo.png", logoSize: "scale-50 lg:scale-80" }
                ]}
            />

            {/* Service Sponsors */}
            <SponsorGrid
                title="Service"
                textOnlyHeight="h-16"
                columns="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5"
                rowGap="gap-y-4"
                sponsors={[
                    { name: "Seal Engineering" },
                    { name: "CF Maskin" },
                    { name: "Eik Lab" },
                    { name: "3D Connexion" },
                    { name: "Speeding" },
                    { name: "Asher Racing" },
                    { name: "Solidworks" },
                    { name: "Asys" },
                    { name: "EDR Medeso" },
                    { name: "IPG" },
                    { name: "RS" },
                    { name: "Servi Group" },
                    { name: "Foliekniven" },
                    { name: "Biesterfeld"}
                ]}
            />
        </div>
    )
}

export default SponsorPage;