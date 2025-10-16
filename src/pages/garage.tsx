const garage = () => {
    return (
        <div className="bg-background text-foreground flex flex-col gap-32 items-center py-12">
            <div className="w-full max-w-8xl flex flex-col items-center relative">
                {/* Big background text for Børsen */}
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20vw] font-extrabold text-white opacity-15 select-none pointer-events-none z-0 whitespace-nowrap">BØRSEN</span>
                <h2 className="text-7xl font-bold mb-8 z-10 relative">Børsen</h2>
                <div className="flex justify-center w-full">
                  <img src="/Børsen (1).png" alt="Børsen" className="z-10 relative h-[63vh] object-contain mb-8" />
                </div>
                {/* Stats overlay for Børsen */}
                <div className="w-full max-w-5xl mx-auto px-12 py-6 bg-black/70 text-white rounded-xl shadow-lg flex flex-row justify-between items-center gap-12 -mt-32 z-10 relative text-2xl">
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Weight</h3>
                        <div className="text-xl">987 kg</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Height</h3>
                        <div className="text-xl">2.1 m</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Length</h3>
                        <div className="text-xl">6.3 m</div>
                    </div>
                </div>
            </div>
            <div className="w-full max-w-7xl flex flex-col items-center relative">
                {/* Big background text for Arken */}
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[22vw] font-extrabold text-white opacity-15 select-none pointer-events-none z-0 whitespace-nowrap">ARKEN</span>
                <h1 className="text-7xl font-bold mb-8 z-10 relative">Arken</h1>
                <img src="/Arken1.png" alt="Arken" className="z-10 relative w-full h-[60vh] object-contain mb-8" />
                {/* Stats overlay for Arken */}
                <div className="w-full max-w-5xl mx-auto px-12 py-6 bg-black/70 text-white rounded-xl shadow-lg flex flex-row justify-between items-center gap-12 -mt-32 z-10 relative text-2xl">
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Weight</h3>
                        <div className="text-xl">1234 kg</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Height</h3>
                        <div className="text-xl">2.5 m</div>
                    </div>
                    <div className="flex-1 text-center">
                        <h3 className="text-2xl font-semibold mb-2">Length</h3>
                        <div className="text-xl">7.8 m</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default garage;