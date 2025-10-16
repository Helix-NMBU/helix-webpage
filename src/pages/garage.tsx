const garage = () => {
    return (
        <div className="bg-background text-foreground flex flex-col gap-24 items-center py-8">
            <div className="w-full max-w-4xl flex flex-col items-center relative">
                {/* Big background text for Børsen */}
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[13vw] font-extrabold text-white opacity-10 select-none pointer-events-none z-0 whitespace-nowrap">BØRSEN</span>
                <h2 className="text-5xl font-bold mb-4 z-10 relative">Børsen</h2>
                <img src="/Børsenpng.avif" alt="Børsen" className="z-10 relative" />
                {/* Stats overlay for Børsen */}
                <div className="w-full max-w-2xl mx-auto px-6 py-4 bg-black/70 text-white rounded-lg shadow-lg flex flex-row justify-between items-center gap-8 -mt-24 z-10 relative">
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Weight</h3>
                        <div className="text-lg">987 kg</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Height</h3>
                        <div className="text-lg">2.1 m</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Length</h3>
                        <div className="text-lg">6.3 m</div>
                    </div>
                </div>
            </div>
            <div className="w-full max-w-4xl flex flex-col items-center relative">
                {/* Big background text for Arken */}
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-extrabold text-white opacity-10 select-none pointer-events-none z-0 whitespace-nowrap">ARKEN</span>
                <h1 className="text-5xl font-bold mb-4 z-10 relative">Arken</h1>
                <img src="/Arkenpng.avif" alt="Arken" className="z-10 relative" />
                {/* Stats overlay for Arken */}
                <div className="w-full max-w-2xl mx-auto px-6 py-4 bg-black/70 text-white rounded-lg shadow-lg flex flex-row justify-between items-center gap-8 -mt-24 z-10 relative">
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Weight</h3>
                        <div className="text-lg">1234 kg</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Height</h3>
                        <div className="text-lg">2.5 m</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-xl font-semibold mb-1">Length</h3>
                        <div className="text-lg">7.8 m</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default garage;