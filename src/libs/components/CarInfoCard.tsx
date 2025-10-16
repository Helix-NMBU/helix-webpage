
interface Car {
    id: number;
  name: string;
  season: string;
  image: string;
  stats: {
    focus: string;
    motor: string;
    weight: string;
  };
}

const CarInfoCard = ({ car }: { car: Car }) => {
  return (
    <div className="w-full max-w-8xl flex flex-col items-center relative">
            {/* Big background text for Børsen */}
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20vw] font-extrabold text-secondary opacity-40 select-none pointer-events-none z-0 whitespace-nowrap">{car.name.toUpperCase()}</span>
            <h2 className="text-7xl font-bold mb-8 z-10 relative">Sesongen {car.season}</h2>
            <div className="flex justify-center w-full">
            <img src={car.image} alt={car.name} className="z-10 relative h-[63vh] object-contain mb-8" />
            </div>
            {/* Stats overlay for Børsen */}
            <div className="w-full max-w-5xl mx-auto px-12 py-6 bg-black/70 text-white rounded-xl shadow-lg flex flex-row justify-between items-center gap-12 -mt-32 z-10 relative text-2xl">
            <div className="flex-1 text-center">
                <h3 className="text-2xl font-semibold mb-2">Fokus</h3>
                <div className="text-xl">{car.stats.focus}</div>
            </div>
            <div className="flex-1 text-center">
                <h3 className="text-2xl font-semibold mb-2">Motor</h3>
                <div className="text-xl">{car.stats.motor}</div>
            </div>
            <div className="flex-1 text-center">
                <h3 className="text-2xl font-semibold mb-2">Vekt</h3>
                <div className="text-xl">{car.stats.weight}</div>
            </div>
            </div>
        </div>
    );
};

export default CarInfoCard;